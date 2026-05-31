import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as FileSystem from 'expo-file-system/legacy';
import { getSafeRootDir } from '../../utils/fileManager';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function SelectExercise() {
  const { category } = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [files, setFiles] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [progress, setProgress] = useState({});
  const [activeTab, setActiveTab] = useState('pending'); // 'pending' or 'finished'

  useEffect(() => {
    loadFiles();
  }, []);

  useEffect(() => {
    const interval = setInterval(loadProgress, 1000);
    loadProgress();
    return () => clearInterval(interval);
  }, []);

  const loadProgress = async () => {
    try {
      const data = await AsyncStorage.getItem('learn_progress');
      if (data && data.trim()) {
        const parsed = JSON.parse(data.replace(/^\uFEFF/, '').trim());
        setProgress(parsed);
      }
    } catch (e) { }
  };

  const loadFiles = async () => {
    const root = getSafeRootDir();
    // Functional Fix: Learn root is sibling to ExamList
    const learnRoot = root.replace('ExamList/', 'Learn/');
    const path = `${learnRoot}${category}/`;

    try {
      const list = await FileSystem.readDirectoryAsync(path);
      setFiles(list.filter(f => f.toLowerCase().endsWith('.json')).sort());
    } catch (e) {
      setFiles([]);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredFiles = files.filter(item => {
    const fileKey = `${category}_${item}`;
    const isCompleted = progress[fileKey]?.completed;
    return activeTab === 'finished' ? isCompleted : !isCompleted;
  });

  const renderItem = ({ item }) => {
    const fileKey = `${category}_${item}`;
    const fileProg = progress[fileKey];
    const isCompleted = fileProg && fileProg.completed;
    const isStarted = fileProg && !isCompleted;

    return (
      <View style={styles.card}>
        <View style={styles.titleRow}>
          <MaterialCommunityIcons
            name={isCompleted ? "checkbox-marked-circle" : "book-outline"}
            size={22}
            color={isCompleted ? "#2196F3" : "#4A90E2"}
            style={{ marginRight: 10, marginTop: 2 }}
          />
          <Text style={styles.cardText}>
            {item.replace(/\.json$/i, '').replace(/_/g, ' ').toUpperCase()}
          </Text>
        </View>

        <View style={styles.actionRow}>
          <View style={styles.metaInfo}>
            <View style={styles.statusBadge}>
              <Text style={[styles.completedTag, { color: isCompleted ? '#4CAF50' : (isStarted ? '#FF9800' : '#2196F3') }]}>
                {isCompleted ? "COMPLETED" : (isStarted ? `RESUME Q${fileProg.index + 1}` : "NOT STARTED")}
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.startBtn, isCompleted && styles.reAttemptBtn, isStarted && { backgroundColor: '#FF9800', shadowColor: '#FF9800' }]}
            onPress={() => router.push({ pathname: "/learn/exercise-screen", params: { category, fileName: item } })}
          >
            <Text style={styles.btnText}>
              {isCompleted ? "REVISE" : (isStarted ? "RESUME" : "START")}
            </Text>
            <MaterialCommunityIcons
              name={isCompleted ? "refresh" : "play"}
              size={18}
              color="#FFF"
              style={{ marginLeft: 5 }}
            />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.headerSection}>
        <View style={styles.navRow}>
          <TouchableOpacity onPress={() => router.back()}>
            <MaterialCommunityIcons name="arrow-left" size={28} color="#2D3436" />
          </TouchableOpacity>
          <Text style={styles.header}>{category.replace(/_/g, ' ').toUpperCase()}</Text>
        </View>

        <View style={styles.tabBar}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'pending' && styles.activeTab]}
            onPress={() => setActiveTab('pending')}
          >
            <Text style={[styles.tabText, activeTab === 'pending' && styles.activeTabText]}>
              PENDING ({files.filter(f => !progress[`${category}_${f}`]?.completed).length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'finished' && styles.activeTab]}
            onPress={() => setActiveTab('finished')}
          >
            <Text style={[styles.tabText, activeTab === 'finished' && styles.activeTabText]}>
              FINISHED ({files.filter(f => progress[`${category}_${f}`]?.completed).length})
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {isLoading ? <ActivityIndicator size="large" color="#2196F3" style={{marginTop: 50}} /> :
        <FlatList
          data={filteredFiles}
          renderItem={renderItem}
          keyExtractor={i => i}
          contentContainerStyle={{padding: 20}}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <MaterialCommunityIcons
                name={activeTab === 'finished' ? "clipboard-check-outline" : "clipboard-text-outline"}
                size={60}
                color="#BDC3C7"
              />
              <Text style={styles.emptyText}>
                {activeTab === 'finished' ? "No finished exercises yet." : "All exercises completed!"}
              </Text>
            </View>
          }
        />
      }
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  headerSection: { backgroundColor: '#FFF', paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  navRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 15 },
  header: { fontSize: 20, fontWeight: '900', color: '#2D3436', marginLeft: 15, letterSpacing: 0.5 },
  tabBar: { flexDirection: 'row', backgroundColor: '#F1F2F6', borderRadius: 12, padding: 4, marginBottom: 15 },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10 },
  activeTab: { backgroundColor: '#FFF', elevation: 2 },
  tabText: { fontSize: 13, fontWeight: '800', color: '#95A5A6', letterSpacing: 0.5 },
  activeTabText: { color: '#2196F3' },
  card: {
    backgroundColor: '#FFF',
    padding: 22,
    borderRadius: 28,
    marginBottom: 20,
    elevation: 8,
    shadowColor: '#2196F3',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 18,
  },
  cardText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '900',
    color: '#2D3436',
    lineHeight: 22,
    letterSpacing: 0.5
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#F8F9FA',
    paddingTop: 18,
    marginTop: 2
  },
  metaInfo: {
    flexDirection: 'column',
  },
  statusBadge: {
    backgroundColor: '#F1F2F6',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    alignSelf: 'flex-start'
  },
  completedTag: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.8
  },
  startBtn: {
    backgroundColor: '#2196F3',
    paddingVertical: 12,
    paddingHorizontal: 25,
    borderRadius: 15,
    flexDirection: 'row',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#2196F3',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8
  },
  reAttemptBtn: {
    backgroundColor: '#4A90E2',
    shadowColor: '#4A90E2',
  },
  btnText: {
    color: '#FFF',
    fontWeight: '900',
    fontSize: 13,
    letterSpacing: 1
  },
  emptyContainer: { alignItems: 'center', marginTop: 100 },
  emptyText: { marginTop: 15, fontSize: 16, color: '#BDC3C7', fontWeight: '800' }
});
