import React, { useState, useEffect } from 'react';
import { 
  View, Text, StyleSheet, FlatList, TouchableOpacity, 
  ActivityIndicator, Alert 
} from 'react-native';
import { useRouter } from 'expo-router';
import * as FileSystem from 'expo-file-system/legacy';
import { getSafeRootDir, sanitizeName } from '../../utils/fileManager';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function SelectExam() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [folders, setFolders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadFolders();
  }, []);

  const loadFolders = async () => {
    const root = getSafeRootDir();
    if (!root) {
      setIsLoading(false);
      return;
    }

    try {
      const info = await FileSystem.getInfoAsync(root);
      if (info.exists) {
        const list = await FileSystem.readDirectoryAsync(root);
        const filtered = list
          .filter(item => !item.startsWith('.') && item !== 'cache')
          .sort((a, b) => a.localeCompare(b));
        setFolders(filtered);
      } else {
        await FileSystem.makeDirectoryAsync(root, { intermediates: true });
      }
    } catch (e) {
    } finally {
      setIsLoading(false);
    }
  };

  const renderItem = ({ item }) => (
    <TouchableOpacity 
      style={styles.card} 
      onPress={() => router.push({ pathname: "/quiz/select-quiz", params: { category: item } })}
      activeOpacity={0.8}
    >
      <View style={styles.iconCircle}>
        <MaterialCommunityIcons name="folder-text-outline" size={26} color="#4A90E2" />
      </View>
      <View style={{ flex: 1, marginLeft: 18 }}>
        <Text style={styles.cardText}>{item.replace(/_/g, ' ').toUpperCase()}</Text>
        <Text style={styles.cardSubText}>PRACTICE MODULE</Text>
      </View>
      <View style={styles.arrowBox}>
        <MaterialCommunityIcons name="chevron-right" size={24} color="#4A90E2" />
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.headerSection}>
        <Text style={styles.header}>SELECT CATEGORY</Text>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#4A90E2" />
        </View>
      ) : (
        <FlatList
          data={folders}
          keyExtractor={(item) => item}
          renderItem={renderItem}
          contentContainerStyle={[styles.listPadding, { paddingBottom: insets.bottom + 40 }]}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
               <MaterialCommunityIcons name="folder-alert-outline" size={80} color="#E0E0E0" />
               <Text style={styles.emptyText}>No Categories Found</Text>
               <Text style={styles.emptySubText}>Please sync from the main dashboard.</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  headerSection: {
    paddingHorizontal: 25,
    paddingTop: 30,
    paddingBottom: 30,
    backgroundColor: '#FFF',
    borderBottomLeftRadius: 40,
    borderBottomRightRadius: 40,
    elevation: 8,
    shadowColor: '#4A90E2',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    alignItems: 'center',
    zIndex: 10
  },
  header: {
    fontSize: 24,
    fontWeight: '900',
    color: '#2D3436',
    letterSpacing: 1.5,
    textAlign: 'center'
  },
  listPadding: { padding: 20, paddingTop: 30 },
  card: { 
    backgroundColor: '#FFF',
    padding: 22,
    borderRadius: 35,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    elevation: 6,
    shadowColor: '#A4B0BE',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 15,
    borderWidth: 1,
    borderColor: '#F1F2F6'
  },
  iconCircle: {
    width: 60,
    height: 60,
    borderRadius: 22,
    backgroundColor: '#F0F7FF',
    justifyContent: 'center',
    alignItems: 'center'
  },
  cardText: {
    fontSize: 16,
    fontWeight: '900',
    color: '#2D3436',
    letterSpacing: 0.5
  },
  cardSubText: {
    fontSize: 10,
    color: '#A4B0BE',
    fontWeight: '800',
    marginTop: 4,
    letterSpacing: 1
  },
  arrowBox: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: '#F1F2F6',
    justifyContent: 'center',
    alignItems: 'center'
  },
  emptyContainer: { alignItems: 'center', marginTop: 100 },
  emptyText: { fontSize: 20, fontWeight: '900', color: '#2D3436', marginTop: 20 },
  emptySubText: {
    fontSize: 14,
    color: '#95A5A6',
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 50,
    lineHeight: 22,
    fontWeight: '600'
  }
});
