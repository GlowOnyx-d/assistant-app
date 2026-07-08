import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator, Modal, Animated, TouchableWithoutFeedback, Dimensions, Alert, RefreshControl } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MessageSquarePlus, MessageCircle, LogOut } from 'lucide-react-native';
import { BACKEND_URL } from '../config';

const { width } = Dimensions.get('window');

export default function Sidebar({ isOpen, onClose, navigation, currentChatId, onSelectChat }) {
  const [chats, setChats] = useState([]);
  const [loading, setLoading] = useState(false);
  const slideAnim = React.useRef(new Animated.Value(-width)).current;

  useEffect(() => {
    if (isOpen) {
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }).start();
      fetchChats();
    } else {
      Animated.timing(slideAnim, {
        toValue: -width,
        duration: 250,
        useNativeDriver: true,
      }).start();
    }
  }, [isOpen]);

  const handleAuthError = async () => {
    onClose();
    await AsyncStorage.removeItem('userToken');
    Alert.alert("Session Expired", "Your session expired, please log in again");
    navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
  };

  const fetchChats = async () => {
    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('userToken');
      const res = await fetch(`${BACKEND_URL}/api/chats`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.status === 401) return handleAuthError();
      if (res.ok) {
        const data = await res.json();
        setChats(data);
      }
    } catch (e) {
      console.error('Failed to fetch chats', e);
    }
    setLoading(false);
  };

  const handleLogout = () => {
    Alert.alert(
      "Log Out",
      "Are you sure you want to log out?",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Logout", 
          style: "destructive",
          onPress: async () => {
            onClose();
            await AsyncStorage.removeItem('userToken');
            await AsyncStorage.removeItem('userName');
            navigation.replace('Login');
          }
        }
      ]
    );
  };

  const handleSelect = (id) => {
    onClose();
    onSelectChat(id);
  };

  const handleDelete = (id) => {
    Alert.alert(
      "Delete Chat",
      "Are you sure you want to delete this chat?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              const token = await AsyncStorage.getItem('userToken');
              const res = await fetch(`${BACKEND_URL}/api/chats/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
              });
              if (res.status === 401) return handleAuthError();
              if (res.ok) {
                // Remove locally to update UI immediately
                setChats(prev => prev.filter(c => c.chatId !== id));
                // If it's the active chat, reset the chat view
                if (id === currentChatId) {
                  onSelectChat(null);
                }
              } else {
                Alert.alert("Error", "Failed to delete chat");
              }
            } catch (e) {
              console.error(e);
              Alert.alert("Error", "Network error while deleting");
            }
          }
        }
      ]
    );
  };

  const renderItem = ({ item }) => {
    const isActive = item.chatId === currentChatId;
    return (
      <TouchableOpacity 
        style={[styles.chatItem, isActive && styles.chatItemActive]} 
        onPress={() => handleSelect(item.chatId)}
        onLongPress={() => handleDelete(item.chatId)}
        delayLongPress={500}
      >
        <MessageCircle size={20} color={isActive ? "#fff" : "#888"} style={{ marginRight: 12 }} />
        <Text style={[styles.chatTitle, isActive && styles.chatTitleActive]} numberOfLines={1}>{item.title}</Text>
      </TouchableOpacity>
    );
  }

  const renderEmptyState = () => {
    if (loading) return null;
    return (
      <View style={styles.emptyStateContainer}>
        <MessageSquarePlus size={48} color="#333" style={{ marginBottom: 16 }} />
        <Text style={styles.emptyStateTitle}>No chats yet</Text>
        <Text style={styles.emptyStateSubtitle}>Start a new conversation</Text>
      </View>
    );
  };

  return (
    <Modal visible={isOpen} transparent={true} animationType="none" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableWithoutFeedback onPress={onClose}>
          <View style={styles.backdrop} />
        </TouchableWithoutFeedback>
        
        <Animated.View style={[styles.sidebar, { transform: [{ translateX: slideAnim }] }]}>
          <Text style={styles.headerTitle}>Conversations</Text>
          
          <TouchableOpacity 
            style={styles.newChatBtn}
            onPress={() => handleSelect(null)}
          >
            <MessageSquarePlus size={20} color="#fff" style={{ marginRight: 8 }} />
            <Text style={styles.newChatText}>New Chat</Text>
          </TouchableOpacity>

          <View style={styles.divider} />

          {loading && chats.length === 0 ? (
            <ActivityIndicator color="#fff" style={{ marginTop: 20 }} />
          ) : (
            <FlatList
              data={chats}
              keyExtractor={(item) => item.chatId}
              renderItem={renderItem}
              contentContainerStyle={[{ padding: 16 }, chats.length === 0 && styles.emptyListContent]}
              ListEmptyComponent={renderEmptyState}
              refreshControl={
                <RefreshControl refreshing={loading && chats.length > 0} onRefresh={fetchChats} tintColor="#fff" colors={['#fff']} />
              }
            />
          )}

          <View style={styles.divider} />
          
          <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
            <LogOut size={20} color="#ef4444" style={{ marginRight: 8 }} />
            <Text style={styles.logoutText}>Log Out</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, flexDirection: 'row' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  sidebar: { width: width * 0.75, maxWidth: 320, backgroundColor: '#1a1a1a', height: '100%', paddingTop: 50, elevation: 5, shadowColor: '#000', shadowOffset: { width: 2, height: 0 }, shadowOpacity: 0.5, shadowRadius: 5 },
  headerTitle: { color: '#888', fontSize: 14, fontWeight: '600', paddingHorizontal: 20, marginBottom: 10, textTransform: 'uppercase' },
  newChatBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#333', marginHorizontal: 16, marginBottom: 16, padding: 14, borderRadius: 8 },
  newChatText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  divider: { height: 1, backgroundColor: '#333', marginHorizontal: 16 },
  chatItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 12, borderRadius: 8, marginBottom: 4 },
  chatItemActive: { backgroundColor: '#333' },
  chatTitle: { color: '#d4d4d4', fontSize: 16, flex: 1 },
  chatTitleActive: { color: '#fff', fontWeight: '500' },
  emptyListContent: { flexGrow: 1, justifyContent: 'center' },
  emptyStateContainer: { alignItems: 'center', justifyContent: 'center', marginTop: 40 },
  emptyStateTitle: { color: '#fff', fontSize: 18, fontWeight: '600', marginBottom: 8 },
  emptyStateSubtitle: { color: '#888', fontSize: 14 },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', padding: 20, paddingBottom: 40 },
  logoutText: { color: '#ef4444', fontSize: 16, fontWeight: '600' },
});
