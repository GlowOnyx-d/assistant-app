import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  FlatList,
  Animated,
  Keyboard,
  Alert,
  Image,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { Send, Menu, Paperclip, X, Bot, RotateCcw, Copy, Edit2, RefreshCw, Square, Volume2, VolumeX, ChevronDown, Download } from 'lucide-react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import * as Clipboard from 'expo-clipboard';
import Markdown from 'react-native-markdown-display';
import * as Haptics from 'expo-haptics';
import * as Speech from 'expo-speech';
import EventSource from 'react-native-sse';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useHeaderHeight } from '@react-navigation/elements';
import { BACKEND_URL } from '../config';
import Sidebar from '../components/Sidebar';

const TypingIndicator = () => {
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animateDot = (dot, delay) => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(dot, { toValue: 1, duration: 400, delay: delay, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0, duration: 400, useNativeDriver: true }),
        ])
      ).start();
    };

    animateDot(dot1, 0);
    animateDot(dot2, 200);
    animateDot(dot3, 400);
  }, [dot1, dot2, dot3]);

  const dotStyle = (dot) => ({
    opacity: dot.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }),
    transform: [{ scale: dot.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1.2] }) }],
  });

  return (
    <View style={styles.typingContainer}>
      <Animated.View style={[styles.typingDot, dotStyle(dot1)]} />
      <Animated.View style={[styles.typingDot, dotStyle(dot2)]} />
      <Animated.View style={[styles.typingDot, dotStyle(dot3)]} />
    </View>
  );
};

export default function ChatScreen({ navigation, route }) {
  const [messages, setMessages] = useState([]);
  const [isGreetingLoading, setIsGreetingLoading] = useState(true);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [currentChatId, setCurrentChatId] = useState(route.params?.chatId || null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [attachedFile, setAttachedFile] = useState(null);
  const [speakingIndex, setSpeakingIndex] = useState(null);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [fullScreenImage, setFullScreenImage] = useState(null);
  const eventSourceRef = useRef(null);
  const flatListRef = useRef(null);
  const isNearBottomRef = useRef(true);

  useEffect(() => {
    return () => Speech.stop();
  }, []);

  const handleAuthError = async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    await AsyncStorage.removeItem('userToken');
    Alert.alert("Session Expired", "Your session expired, please log in again");
    navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
  };

  useEffect(() => {
    setCurrentChatId(route.params?.chatId || null);
  }, [route.params?.chatId]);

  useEffect(() => {
    async function initChat() {
      if (currentChatId) {
        try {
          const token = await AsyncStorage.getItem('userToken');
          const res = await fetch(`${BACKEND_URL}/api/chats/${currentChatId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (res.status === 401) return handleAuthError();
          if (res.ok) {
            const data = await res.json();
            setMessages(data.messages || []);
            setIsGreetingLoading(false);
            return;
          }
        } catch (e) {
          console.error(e);
        }
      }
      
      // Fallback to greeting if no chat ID or fetch failed
      const storedName = await AsyncStorage.getItem('userName');
      console.log('Fetched userName in ChatScreen:', storedName);
      const userName = storedName || 'User';
      const hour = new Date().getHours();
      let greeting = '';
      if (hour >= 5 && hour < 12) {
        greeting = `Good Morning, ${userName}`;
      } else if (hour >= 12 && hour < 17) {
        greeting = `Good Afternoon, ${userName}`;
      } else if (hour >= 17 && hour < 21) {
        greeting = `Good Evening, ${userName}`;
      } else {
        greeting = `Working late, ${userName}?`;
      }
      setMessages([{ role: 'assistant', content: greeting }]);
      setIsGreetingLoading(false);
    }
    initChat();
  }, [currentChatId]);

  const handleDownloadImage = async (imageUrl) => {
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert("Permission Denied", "We need photo gallery permissions to save the image.");
        return;
      }
      
      const fileUri = FileSystem.documentDirectory + `generated_image_${Date.now()}.jpg`;
      const { uri } = await FileSystem.downloadAsync(imageUrl, fileUri);
      
      await MediaLibrary.createAssetAsync(uri);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Success", "Image saved to gallery!");
    } catch (error) {
      console.error(error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Error", "Failed to save image.");
    }
  };

  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);

  const headerHeight = useHeaderHeight();

  useEffect(() => {
    if (Platform.OS === 'android') {
      const showSub = Keyboard.addListener('keyboardDidShow', (e) => {
        console.log('Keyboard height:', e.endCoordinates.height);
        setKeyboardHeight(e.endCoordinates.height);
      });
      const hideSub = Keyboard.addListener('keyboardDidHide', () => {
        console.log('Keyboard hidden');
        setKeyboardHeight(0);
      });
      return () => {
        showSub.remove();
        hideSub.remove();
      };
    }
  }, []);

  const handleLogout = async () => {
    await AsyncStorage.removeItem('userToken');
    await AsyncStorage.removeItem('userName');
    navigation.replace('Login');
  };

  useLayoutEffect(() => {
    navigation.setOptions({
      headerLeft: () => (
        <TouchableOpacity onPress={() => setIsSidebarOpen(true)} style={{ marginLeft: 5, marginRight: 15 }}>
          <Menu color="#fff" size={24} />
        </TouchableOpacity>
      ),
      headerRight: null,
      headerStyle: { backgroundColor: '#111' },
      headerTintColor: '#fff',
      title: 'AI Assistant',
    });
  }, [navigation]);

  const saveMessagesToBackend = async (chatId, msgs, newTitle) => {
    try {
      const token = await AsyncStorage.getItem('userToken');
      const res = await fetch(`${BACKEND_URL}/api/chats/${chatId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ messages: msgs, title: newTitle })
      });
      if (res.status === 401) handleAuthError();
    } catch (e) {
      console.error('Failed to save messages', e);
    }
  };

  const handleAttachment = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'text/plain', 'image/*'],
        copyToCacheDirectory: true,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const file = result.assets[0];
        
        if (file.mimeType && file.mimeType.startsWith('image/')) {
          setAttachedFile({ uri: file.uri, name: file.name, type: 'image' });
          return;
        }

        setAttachedFile({ uri: file.uri, name: file.name, type: 'document', loading: true });
        
        const token = await AsyncStorage.getItem('userToken');

        console.log('--- UPLOAD DEBUG ---');
        console.log('Uploading to URL:', `${BACKEND_URL}/api/upload`);
        console.log('File Info:', file.name, file.mimeType, file.uri);

        // Use expo-file-system to completely bypass the React Native fetch FormData bug on Android
        const res = await FileSystem.uploadAsync(`${BACKEND_URL}/api/upload`, file.uri, {
          fieldName: 'file',
          httpMethod: 'POST',
          uploadType: 1, // FileSystemUploadType.MULTIPART resolves to 1
          mimeType: file.mimeType || 'application/pdf',
          headers: {
            'Authorization': `Bearer ${token}`
          },
        });

        if (res.status === 401) return handleAuthError();

        if (res.status === 200) {
          const data = JSON.parse(res.body);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          setAttachedFile({ uri: file.uri, name: file.name, type: 'document', extractedText: data.text });
        } else {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          console.error('Upload Error Response:', res.body);
          let errorMessage = "Could not extract text from document.";
          try {
            const parsedError = JSON.parse(res.body);
            if (parsedError.details) {
              errorMessage = `Server Error: ${parsedError.details} (Buffer Size: ${parsedError.bufferSize})`;
            }
          } catch (e) {}
          
          setAttachedFile(null);
          Alert.alert("Upload Failed", errorMessage);
        }
      }
    } catch (err) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      console.error(err);
      setAttachedFile(null);
    }
  };

  const handleRetry = () => {
    const lastUserIndex = messages.map(m => m.role).lastIndexOf('user');
    if (lastUserIndex === -1) return;
    
    const textToRetry = messages[lastUserIndex].content;
    const restoredMessages = messages.slice(0, lastUserIndex);
    
    handleSend(textToRetry, restoredMessages);
  };

  const handleCopy = async (text) => {
    await Clipboard.setStringAsync(text);
  };

  const handleEdit = (index) => {
    const textToEdit = messages[index].content;
    const restoredMessages = messages.slice(0, index);
    setMessages(restoredMessages);
    setInput(textToEdit);
  };

  const handleSpeak = async (text, index) => {
    if (speakingIndex === index) {
      Speech.stop();
      setSpeakingIndex(null);
    } else {
      Speech.stop();
      setSpeakingIndex(index);
      Speech.speak(text, {
        onDone: () => setSpeakingIndex(null),
        onStopped: () => setSpeakingIndex(null),
        onError: () => setSpeakingIndex(null),
      });
    }
  };

  const handleRegenerate = () => {
    const lastUserIndex = messages.map(m => m.role).lastIndexOf('user');
    if (lastUserIndex === -1) return;
    
    const textToRetry = messages[lastUserIndex].content;
    const restoredMessages = messages.slice(0, lastUserIndex);
    
    handleSend(textToRetry, restoredMessages);
  };

  const handleSend = async (overrideInput = null, overrideMessages = null) => {
    const isOverride = typeof overrideInput === 'string';
    const currentInput = (isOverride ? overrideInput : input).trim();
    if (!currentInput || isTyping) return;
    
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    isNearBottomRef.current = true;

    const baseMessages = overrideMessages !== null ? overrideMessages : messages;

    const timestamp = new Date().toISOString();
    const userMessage = { role: 'user', content: currentInput, timestamp };
    
    if (attachedFile && attachedFile.extractedText) {
      userMessage.attachedFileName = attachedFile.name;
      userMessage.attachedFileText = attachedFile.extractedText;
    }
    
    const newMessages = [...baseMessages, userMessage];
    setMessages(newMessages);
    
    if (!isOverride) setInput('');
    setIsTyping(true);

    const token = await AsyncStorage.getItem('userToken');
    let activeChatId = currentChatId;
    let newTitle = currentInput.length > 30 ? currentInput.substring(0, 30) + '...' : currentInput;

    if (!activeChatId) {
      // Create new chat
      const res = await fetch(`${BACKEND_URL}/api/chats`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.status === 401) return handleAuthError();
      if (res.ok) {
        const data = await res.json();
        activeChatId = data.chatId;
        setCurrentChatId(activeChatId);
      }
    }

    // --- PHASE 2: Check for image generation command ---
    const imageRegex = /^(?:can you\s+)?(?:please\s+)?(?:create|generate|draw|make|show me|show|paint me|paint|i want|sketch|illustrate)(?:\s+(?:me\s+)?(?:a|an|some|the))?\s+(image|picture|photo|drawing|art|painting|sketch|illustration)(?:s)?(?:\s*(?:of|showing|depicting|about|with|[,:]))?\s+(.+)$/i;
    
    let isImageRequest = false;
    let imagePrompt = "";

    if (currentInput.toLowerCase().startsWith('/imagine ')) {
      isImageRequest = true;
      imagePrompt = currentInput.substring(9).trim();
    } else {
      const match = currentInput.match(imageRegex);
      if (match && match[2]) {
        isImageRequest = true;
        imagePrompt = match[2].trim();
      }
    }

    if (isImageRequest && imagePrompt) {
      const prompt = imagePrompt;
      
      let aiMessage = { 
        role: 'assistant', 
        isImage: true, 
        loading: true, 
        content: 'Generating image...',
        timestamp: new Date().toISOString() 
      };
      setMessages(prev => [...prev, aiMessage]);
      setAttachedFile(null);
      
      if (activeChatId) {
        await saveMessagesToBackend(activeChatId, [...newMessages, aiMessage], newTitle);
      }

      try {
        const res = await fetch(`${BACKEND_URL}/api/generate-image`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ prompt })
        });
        
        if (res.status === 401) return handleAuthError();
        
        if (res.ok) {
          const data = await res.json();
          aiMessage.imageUrl = data.imageUrl;
          aiMessage.loading = false;
          aiMessage.content = ''; 
          
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          
          setMessages(prev => {
            const updated = [...prev];
            updated[updated.length - 1] = { ...aiMessage };
            return updated;
          });
          
          if (activeChatId) {
            await saveMessagesToBackend(activeChatId, [...newMessages, aiMessage], null);
          }
        } else {
          throw new Error("Failed to generate image");
        }
      } catch (e) {
        console.error(e);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        aiMessage.loading = false;
        aiMessage.content = "Couldn't generate that image, try again";
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = { ...aiMessage };
          return updated;
        });
      }
      setIsTyping(false);
      return;
    }
    // --- End image generation block ---

    const payloadMessages = newMessages.filter(m => m.role !== 'system').map(m => {
      if (m.attachedFileText) {
        return { role: m.role, content: `[The user has attached a document with the following content: ${m.attachedFileText}]\n\n${m.content}` };
      }
      return { role: m.role, content: m.content };
    });
    
    let aiMessage = { role: 'assistant', content: '', timestamp: new Date().toISOString() };
    setMessages(prev => [...prev, aiMessage]);
    
    setAttachedFile(null);

    // Save initial state to backend
    if (activeChatId) {
      await saveMessagesToBackend(activeChatId, [...newMessages, aiMessage], newTitle);
    }

    eventSourceRef.current = new EventSource(`${BACKEND_URL}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ messages: payloadMessages }),
    });

    eventSourceRef.current.addEventListener('message', async (event) => {
      if (event.data === '[DONE]') {
        setIsTyping(false);
        if (eventSourceRef.current) eventSourceRef.current.close();
        if (activeChatId) {
          const finalMessages = [...newMessages, { ...aiMessage }];
          await saveMessagesToBackend(activeChatId, finalMessages, null);

          // PHASE 4: Auto-Generate Title on first message exchange
          if (finalMessages.length === 2 && finalMessages[0].role === 'user') {
            fetch(`${BACKEND_URL}/api/chats/${activeChatId}/title`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
              },
              body: JSON.stringify({ firstMessage: finalMessages[0].content })
            }).then(res => {
              if (res.status === 401) handleAuthError();
            }).catch(e => console.log('Title gen error:', e));
          }
        }
        return;
      }
      try {
        const parsed = JSON.parse(event.data);
        if (parsed.error) {
          setMessages(prev => {
            const updated = [...prev];
            updated[updated.length - 1] = { role: 'system', content: parsed.error };
            return updated;
          });
          setIsTyping(false);
          if (eventSourceRef.current) eventSourceRef.current.close();
          return;
        }
        if (parsed.content) {
          aiMessage.content += parsed.content;
          setMessages(prev => {
            const updated = [...prev];
            updated[updated.length - 1] = { ...aiMessage };
            return updated;
          });
        }
      } catch (e) {}
    });

    eventSourceRef.current.addEventListener('error', (event) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      console.error('SSE Error:', event);
      setMessages(prev => {
        const updated = [...prev];
        if (updated.length > 0 && updated[updated.length - 1].role === 'assistant' && updated[updated.length - 1].content === '') {
          updated[updated.length - 1] = { role: 'system', content: "Couldn't connect. Check your internet and try again." };
        } else {
          updated.push({ role: 'system', content: "Couldn't connect. Check your internet and try again." });
        }
        return updated;
      });
      setIsTyping(false);
      if (eventSourceRef.current) eventSourceRef.current.close();
    });
  };

  const handleStop = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }
    setIsTyping(false);
    
    if (currentChatId) {
      // Save partial message state to backend
      saveMessagesToBackend(currentChatId, messages, null);
    }
  };

  const formatTime = (isoString) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  };

  const renderItem = ({ item, index }) => {
    if (item.role === 'user') {
      return (
        <View style={styles.userMessageWrapper}>
          <TouchableOpacity 
            style={styles.userMessageBubble}
            onLongPress={() => handleEdit(index)}
            delayLongPress={300}
            activeOpacity={0.7}
          >
            {item.attachedFileName && (
              <View style={styles.messageAttachmentChip}>
                <Paperclip size={14} color="#aaa" style={{ marginRight: 6 }} />
                <Text style={styles.messageAttachmentName} numberOfLines={1}>{item.attachedFileName}</Text>
              </View>
            )}
            <Text style={styles.userMessageText}>{item.content}</Text>
          </TouchableOpacity>
          {item.timestamp && <Text style={styles.timestampText}>{formatTime(item.timestamp)}</Text>}
        </View>
      );
    }
    if (item.role === 'assistant') {
      return (
        <View style={styles.aiMessageWrapper}>
          <View style={styles.aiMessageInner}>
            {item.isImage ? (
              <View style={styles.imageContainer}>
                {item.loading ? (
                  <View style={styles.imageLoadingBox}>
                    <ActivityIndicator color="#fff" />
                    <Text style={styles.imageLoadingText}>Generating image...</Text>
                  </View>
                ) : item.imageUrl ? (
                  <View>
                    <TouchableOpacity activeOpacity={0.8} onPress={() => setFullScreenImage(item.imageUrl)}>
                      <Image source={{ uri: item.imageUrl }} style={styles.generatedImage} resizeMode="cover" />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.downloadImageBtn} onPress={() => handleDownloadImage(item.imageUrl)}>
                      <Download size={20} color="#fff" />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <Text style={styles.systemMessageText}>{item.content}</Text>
                )}
              </View>
            ) : (
              <Markdown style={markdownStyles}>
                {item.content}
              </Markdown>
            )}
          </View>
          
          <View style={styles.aiFooter}>
            {item.timestamp && <Text style={styles.timestampTextLeft}>{formatTime(item.timestamp)}</Text>}
            {!isTyping && index === messages.length - 1 && (
              <View style={styles.actionRow}>
                <TouchableOpacity style={styles.actionBtn} onPress={() => handleCopy(item.content)}>
                  <Copy size={16} color="#888" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionBtn} onPress={handleRegenerate}>
                  <RefreshCw size={16} color="#888" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionBtn} onPress={() => handleSpeak(item.content, index)}>
                  {speakingIndex === index ? (
                    <VolumeX size={16} color="#3b82f6" />
                  ) : (
                    <Volume2 size={16} color="#888" />
                  )}
                </TouchableOpacity>
              </View>
            )}
          </View>

          {isTyping && index === messages.length - 1 && item.content === '' && (
            <TypingIndicator />
          )}
        </View>
      );
    }
    if (item.role === 'system') {
      return (
        <View style={styles.systemMessageWrapper}>
          <Text style={styles.systemMessageText}>{item.content}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={handleRetry}>
            <RotateCcw size={14} color="#ef4444" />
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return null;
  };

  if (isGreetingLoading) {
    return <View style={styles.container} />;
  }

  const renderInputBar = (isCentered = false) => (
    <View style={[styles.inputContainer, { marginBottom: Platform.OS === 'android' ? keyboardHeight : 0 }, isCentered && styles.centeredInputContainer]}>
      {attachedFile && (
        <View style={styles.attachmentChip}>
          <Text style={styles.attachmentName} numberOfLines={1}>
            {attachedFile.loading ? 'Extracting...' : attachedFile.name}
          </Text>
          <TouchableOpacity onPress={() => setAttachedFile(null)}>
            <X size={16} color="#888" />
          </TouchableOpacity>
        </View>
      )}
      <View style={styles.inputWrapper}>
        <TouchableOpacity onPress={handleAttachment} style={styles.attachmentBtn}>
          <Paperclip size={20} color="#888" />
        </TouchableOpacity>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder="Message AI..."
          placeholderTextColor="#666"
          multiline
          maxLength={2000}
          editable={!isTyping}
        />
        {isTyping ? (
          <TouchableOpacity 
            style={styles.stopButton} 
            onPress={handleStop}
          >
            <Square size={16} color="#fff" fill="#fff" />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity 
            style={[styles.sendButton, (!input.trim() || isTyping) && styles.sendButtonDisabled]} 
            onPress={handleSend}
            disabled={!input.trim() || isTyping}
          >
            <Send size={18} color="#fff" />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  const renderContent = () => {
    // If we only have the greeting message, show the centered empty state
    if (messages.length === 1 && messages[0].role === 'assistant' && !currentChatId) {
      return (
        <View style={styles.centeredStateWrapper}>
          <View style={styles.centeredGreetingBox}>
            <Bot size={48} color="#e5e5e5" style={{ marginBottom: 16 }} />
            <Text style={styles.centeredGreetingText}>{messages[0].content}</Text>
          </View>
          {renderInputBar(true)}
        </View>
      );
    }

    // Normal active chat state
    return (
      <>
        <FlatList
          ref={flatListRef}
          style={{ flex: 1 }}
          data={messages}
          keyExtractor={(_, index) => index.toString()}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          onScroll={(e) => {
            const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
            const isNearBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - 100;
            isNearBottomRef.current = isNearBottom;
            setShowScrollToBottom(!isNearBottom);
          }}
          scrollEventThrottle={16}
          onContentSizeChange={() => {
            if (isNearBottomRef.current) {
              flatListRef.current?.scrollToEnd({ animated: true });
            }
          }}
          onLayout={() => flatListRef.current?.scrollToEnd({ animated: true })}
          keyboardShouldPersistTaps="handled"
        />
        {showScrollToBottom && (
          <TouchableOpacity 
            style={[styles.scrollToBottomBtn, { bottom: Platform.OS === 'ios' ? 90 : 80 + keyboardHeight }]} 
            onPress={() => {
              isNearBottomRef.current = true;
              flatListRef.current?.scrollToEnd({ animated: true });
            }}
          >
            <ChevronDown size={24} color="#fff" />
          </TouchableOpacity>
        )}
        {renderInputBar(false)}
      </>
    );
  };

  return (
    <View style={styles.container}>
      {Platform.OS === 'ios' ? (
        <KeyboardAvoidingView 
          style={styles.container} 
          behavior="padding"
          keyboardVerticalOffset={headerHeight}
        >
          {renderContent()}
        </KeyboardAvoidingView>
      ) : (
        renderContent()
      )}

      <Modal visible={!!fullScreenImage} transparent={false} animationType="fade" onRequestClose={() => setFullScreenImage(null)}>
        <View style={styles.fullScreenContainer}>
          <TouchableOpacity style={styles.closeFullScreenBtn} onPress={() => setFullScreenImage(null)}>
            <X size={32} color="#fff" />
          </TouchableOpacity>
          {fullScreenImage && <Image source={{ uri: fullScreenImage }} style={styles.fullScreenImage} resizeMode="contain" />}
        </View>
      </Modal>

      <Sidebar 
        isOpen={isSidebarOpen} 
        onClose={() => setIsSidebarOpen(false)} 
        navigation={navigation}
        currentChatId={currentChatId}
        onSelectChat={(id) => navigation.navigate('Chat', { chatId: id })}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#111' },
  container: { flex: 1, backgroundColor: '#111' },
  listContent: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 20 },
  userMessageWrapper: { alignItems: 'flex-end', marginBottom: 24 },
  userMessageBubble: { backgroundColor: '#262626', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 20, maxWidth: '85%' },
  userMessageText: { color: '#e5e5e5', fontSize: 16, lineHeight: 24 },
  aiMessageWrapper: { alignItems: 'flex-start', marginBottom: 24, maxWidth: '95%' },
  aiMessageInner: { paddingRight: 10 },
  aiFooter: { flexDirection: 'row', alignItems: 'center', marginTop: 4, marginLeft: 4 },
  timestampText: { color: '#666', fontSize: 11, marginTop: 4, marginRight: 4 },
  timestampTextLeft: { color: '#666', fontSize: 11, marginRight: 12 },
  actionRow: { flexDirection: 'row', gap: 16 },
  actionBtn: { padding: 4 },
  systemMessageWrapper: { alignItems: 'center', marginBottom: 24 },
  systemMessageText: { color: '#ef4444', fontSize: 14, textAlign: 'center', marginBottom: 8 },
  retryButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#3f1f1f', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 },
  retryText: { color: '#ef4444', fontSize: 14, marginLeft: 6, fontWeight: '600' },
  inputContainer: { flexDirection: 'column', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#111', borderTopWidth: 1, borderTopColor: '#222' },
  centeredInputContainer: { backgroundColor: 'transparent', borderTopWidth: 0, paddingHorizontal: 0, marginHorizontal: 20 },
  inputWrapper: { flexDirection: 'row', alignItems: 'flex-end' },
  attachmentBtn: { padding: 10, marginRight: 5, paddingBottom: 12 },
  attachmentChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#262626', alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, marginBottom: 10, marginLeft: 10 },
  attachmentName: { color: '#d4d4d4', fontSize: 14, marginRight: 8, maxWidth: 150 },
  messageAttachmentChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#3a3a3a', paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8, marginBottom: 6 },
  messageAttachmentName: { color: '#e5e5e5', fontSize: 12, fontWeight: '500', flexShrink: 1 },
  imageContainer: { marginTop: 8, marginBottom: 8, borderRadius: 12, overflow: 'hidden', backgroundColor: '#1a1a1a' },
  imageLoadingBox: { width: 250, height: 250, alignItems: 'center', justifyContent: 'center', backgroundColor: '#222' },
  imageLoadingText: { color: '#888', marginTop: 12, fontSize: 14 },
  generatedImage: { width: 250, height: 250, borderRadius: 12 },
  downloadImageBtn: { position: 'absolute', bottom: 12, right: 12, backgroundColor: 'rgba(0,0,0,0.6)', padding: 8, borderRadius: 20 },
  fullScreenContainer: { flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },
  closeFullScreenBtn: { position: 'absolute', top: 60, right: 20, zIndex: 10, padding: 10, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 25 },
  fullScreenImage: { width: '100%', height: '100%' },
  input: { flex: 1, backgroundColor: '#1a1a1a', color: '#fff', borderRadius: 20, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, fontSize: 16, maxHeight: 120, minHeight: 40, borderWidth: 1, borderColor: '#333' },
  scrollToBottomBtn: { position: 'absolute', right: 20, backgroundColor: '#333', width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 5 },
  sendButton: { marginLeft: 12, width: 40, height: 40, borderRadius: 20, backgroundColor: '#404040', alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  sendButtonDisabled: { backgroundColor: '#222' },
  stopButton: { marginLeft: 12, width: 40, height: 40, borderRadius: 20, backgroundColor: '#ef4444', alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  typingContainer: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  typingDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: '#666', marginRight: 6 },
  centeredStateWrapper: { flex: 1, justifyContent: 'center' },
  centeredGreetingBox: { alignItems: 'center', paddingHorizontal: 20, marginBottom: 30 },
  centeredGreetingText: { color: '#fff', fontSize: 24, fontWeight: '600', textAlign: 'center', lineHeight: 32 },
});

const markdownStyles = {
  body: { color: '#f5f5f5', fontSize: 16, lineHeight: 26 },
  code_inline: { backgroundColor: '#262626', color: '#fff', borderRadius: 4, paddingHorizontal: 4, paddingVertical: 2, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  code_block: { backgroundColor: '#1a1a1a', color: '#fff', borderRadius: 8, padding: 12, marginVertical: 8, borderWidth: 1, borderColor: '#333', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  link: { color: '#3b82f6' },
  paragraph: { marginTop: 0, marginBottom: 12 },
  heading1: { fontSize: 24, fontWeight: 'bold', marginVertical: 10, color: '#fff' },
  heading2: { fontSize: 20, fontWeight: 'bold', marginVertical: 8, color: '#fff' },
  heading3: { fontSize: 18, fontWeight: 'bold', marginVertical: 6, color: '#fff' },
  list_item: { marginVertical: 4 },
  bullet_list: { marginBottom: 12 },
  ordered_list: { marginBottom: 12 },
};
