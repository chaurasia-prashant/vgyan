import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator, SafeAreaView, Alert, Dimensions, LayoutAnimation, Platform, UIManager } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { GITHUB_TOKEN, LEADERBOARD_FILE_URL, b64_decode, syncAppStatus } from '../../utils/syncService';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width } = Dimensions.get('window');

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function Leaderboard() {
  const [activeTab, setActiveTab] = useState('Live'); // Live, Subjective
  const [leaderboardData, setLeaderboardData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState('');
  const [expandedUsers, setExpandedUsers] = useState({});
  const router = useRouter();

  useFocusEffect(
    useCallback(() => {
      const loadData = async () => {
        // Parallel load of essential data
        await Promise.all([
          getUser(),
          fetchLeaderboard(true)
        ]);

        // Background sync - doesn't block the UI
        syncAppStatus(true).then(() => {
          // Silently refresh in background after sync completes to get latest global data
          fetchLeaderboard(false);
        }).catch(err => console.log("Background sync failed", err));
      };

      loadData();
    }, [])
  );

  const getUser = async () => {
    const name = await AsyncStorage.getItem('user_name');
    setCurrentUser(name);
  };

  const fetchLeaderboard = async (showLoading = true) => {
    if (showLoading) setIsLoading(true);
    try {
      const res = await fetch(`${LEADERBOARD_FILE_URL}?t=${new Date().getTime()}`, {
        headers: { 'Authorization': `Bearer ${GITHUB_TOKEN}`, 'Accept': 'application/vnd.github.v3+json' }
      });
      if (res.ok) {
        const data = await res.json();
        const decoded = b64_decode(data.content.replace(/\s/g, ''));
        let board = JSON.parse(decoded);

        // Optimization: Merge local analytics immediately so user sees their own latest data
        // even before the background sync to GitHub finishes.
        const localAnalyticsStr = await AsyncStorage.getItem('user_analytics');
        if (localAnalyticsStr) {
          const localAnalytics = JSON.parse(localAnalyticsStr);
          const userIdx = board.findIndex(u => u.username === localAnalytics.username);
          if (userIdx !== -1) {
            // Only update if local data is for the same week
            if (board[userIdx].data_date === localAnalytics.data_date) {
               board[userIdx] = localAnalytics;
            }
          } else {
            board.push(localAnalytics);
          }
        }

        setLeaderboardData(board);
      } else {
        setLeaderboardData([]);
      }
    } catch (e) {
      console.error(e);
      if (showLoading) Alert.alert("Error", "Failed to load leaderboard");
    } finally {
      if (showLoading) setIsLoading(false);
    }
  };

  const toggleExpand = (username) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedUsers(prev => ({
      ...prev,
      [username]: !prev[username]
    }));
  };

  const getSortedData = () => {
    let sorted = [...leaderboardData];
    if (activeTab === 'Live') {
      sorted.sort((a, b) => b.live_test_record.score - a.live_test_record.score);
    } else {
      sorted.sort((a, b) => b.subjective_record.score - a.subjective_record.score);
    }
    return sorted;
  };

  const sortedData = getSortedData();
  const topThree = sortedData.slice(0, 3);

  const TopRanker = ({ item, rank, isSubjective }) => (
    <View style={styles.topRankerItem}>
      <View style={styles.avatarContainer}>
        <LinearGradient
          colors={rank === 1 ? ['#FFD700', '#FFA500'] : rank === 2 ? ['#C0C0C0', '#8E8E8E'] : ['#CD7F32', '#A0522D']}
          style={[styles.avatarBorder, rank === 1 && styles.crownContainer]}
        >
           {rank === 1 && <MaterialCommunityIcons name="crown" size={24} color="#FFD700" style={styles.crownIcon} />}
           <Text style={styles.avatarInitial}>{item.username[0].toUpperCase()}</Text>
        </LinearGradient>
        <View style={styles.rankBadgeSmall}>
            <Text style={styles.rankBadgeText}>{rank}</Text>
        </View>
      </View>
      <Text style={styles.topName} numberOfLines={1}>{item.username}</Text>
      <Text style={styles.topScore}>{isSubjective ? item.subjective_record.score : item.live_test_record.score} pts</Text>
    </View>
  );

  const renderRankItem = ({ item, index }) => {
    const isMe = item.username === currentUser;
    const isSub = activeTab === 'Subjective';
    const record = isSub ? item.subjective_record : item.live_test_record;
    const isExpanded = expandedUsers[item.username];
    const rank = index + 1;

    // Highlight styles for top 3
    let highlightStyle = {};
    let rankBadgeColor = '#F1F2F6';
    let rankTextColor = '#A4B0BE';

    if (rank === 1) {
      highlightStyle = { backgroundColor: '#FFF9C4', borderColor: '#FFD700', borderWidth: 1 };
      rankBadgeColor = '#FFD700';
      rankTextColor = '#FFF';
    } else if (rank === 2) {
      highlightStyle = { backgroundColor: '#F5F5F5', borderColor: '#C0C0C0', borderWidth: 1 };
      rankBadgeColor = '#C0C0C0';
      rankTextColor = '#FFF';
    } else if (rank === 3) {
      highlightStyle = { backgroundColor: '#FFF3E0', borderColor: '#CD7F32', borderWidth: 1 };
      rankBadgeColor = '#CD7F32';
      rankTextColor = '#FFF';
    }

    return (
      <TouchableOpacity
        style={[styles.rankCard, highlightStyle, isMe && styles.myRankCard]}
        onPress={() => isSub && toggleExpand(item.username)}
        activeOpacity={isSub ? 0.7 : 1}
      >
        <View style={styles.mainRow}>
            <View style={[styles.rankNumBox, { backgroundColor: rankBadgeColor }]}>
                <Text style={[styles.rankNumText, { color: rankTextColor }]}>{rank}</Text>
            </View>

            <View style={styles.cardInfo}>
                <View style={styles.cardHeader}>
                    <Text style={[styles.cardName, isMe && styles.myText]}>{item.username}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Text style={styles.cardScoreText}>{record.score} PTS</Text>
                        {isSub && (
                            <MaterialCommunityIcons
                                name={isExpanded ? "chevron-up" : "chevron-down"}
                                size={20}
                                color="#6C5CE7"
                                style={{ marginLeft: 5 }}
                            />
                        )}
                    </View>
                </View>

                <View style={styles.statsRow}>
                    <View style={styles.statItem}>
                        <MaterialCommunityIcons name="target" size={14} color="#636E72" />
                        <Text style={styles.statText}>
                            Tests: {record.total_test || 0}
                        </Text>
                    </View>
                    <View style={styles.statItem}>
                        <MaterialCommunityIcons
                            name={isSub ? "cached" : "bullseye-arrow"}
                            size={14}
                            color="#636E72"
                        />
                        <Text style={styles.statText}>
                            {isSub ? `Reattempts: ${record.reattempts || 0}` : `Acc: ${record.accuracy || 0}%`}
                        </Text>
                    </View>
                </View>

                <View style={[styles.statItem, { marginTop: 6 }]}>
                    <MaterialCommunityIcons name="clock-outline" size={14} color="#636E72" />
                    <Text style={styles.statText}>Activity Time: {item.activity || 0} min</Text>
                </View>
            </View>
        </View>

        {isExpanded && isSub && item.section_wisescore && Object.keys(item.section_wisescore).length > 0 && (
            <View style={styles.expandContent}>
                <View style={styles.divider} />
                <Text style={styles.expandTitle}>Section-wise Accuracy</Text>
                <View style={styles.secContainer}>
                    {Object.entries(item.section_wisescore).map(([name, data]) => (
                        <View key={name} style={styles.secBadge}>
                            <Text style={styles.secText}>{name}: <Text style={{ color: '#6C5CE7' }}>{data.avg_accuracy}%</Text></Text>
                            <Text style={styles.secSubText}>{data.total_tests} Tests</Text>
                        </View>
                    ))}
                </View>
            </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient colors={['#6C5CE7', '#A29BFE']} style={styles.topGradient}>
        <View style={styles.header}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                <MaterialCommunityIcons name="arrow-left" size={28} color="#FFF" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Leaderboard</Text>
            <TouchableOpacity onPress={fetchLeaderboard}>
                <MaterialCommunityIcons name="refresh" size={24} color="#FFF" />
            </TouchableOpacity>
        </View>

        <View style={styles.weeklyResetInfo}>
            <MaterialCommunityIcons name="calendar-clock" size={16} color="rgba(255,255,255,0.8)" />
            <Text style={styles.weeklyResetText}>Weekly ranking resets every Monday at 12:00 AM</Text>
        </View>

        <View style={styles.tabToggle}>
            <TouchableOpacity
                style={[styles.toggleBtn, activeTab === 'Live' && styles.toggleBtnActive]}
                onPress={() => setActiveTab('Live')}
            >
                <Text style={[styles.toggleText, activeTab === 'Live' && styles.toggleTextActive]}>LIVE TEST</Text>
            </TouchableOpacity>
            <TouchableOpacity
                style={[styles.toggleBtn, activeTab === 'Subjective' && styles.toggleBtnActive]}
                onPress={() => setActiveTab('Subjective')}
            >
                <Text style={[styles.toggleText, activeTab === 'Subjective' && styles.toggleTextActive]}>SUBJECTIVE</Text>
            </TouchableOpacity>
        </View>

        {topThree.length > 0 && (
            <View style={styles.podium}>
                {topThree[1] && <TopRanker item={topThree[1]} rank={2} isSubjective={activeTab === 'Subjective'} />}
                {topThree[0] && <TopRanker item={topThree[0]} rank={1} isSubjective={activeTab === 'Subjective'} />}
                {topThree[2] && <TopRanker item={topThree[2]} rank={3} isSubjective={activeTab === 'Subjective'} />}
            </View>
        )}
      </LinearGradient>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#6C5CE7" />
        </View>
      ) : (
        <FlatList
          data={sortedData}
          renderItem={renderRankItem}
          keyExtractor={item => item.username}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <MaterialCommunityIcons name="trophy-variant-outline" size={80} color="#DDD" />
              <Text style={styles.emptyText}>No data available yet.</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  topGradient: {
    paddingTop: 40,
    paddingBottom: 20,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    elevation: 10
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 20
  },
  headerTitle: { fontSize: 24, fontWeight: '900', color: '#FFF' },
  weeklyResetInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 15,
    backgroundColor: 'rgba(0,0,0,0.1)',
    alignSelf: 'center',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20
  },
  weeklyResetText: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 10,
    fontWeight: '700',
    marginLeft: 6,
    textTransform: 'uppercase'
  },
  tabToggle: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginHorizontal: 30,
    borderRadius: 15,
    padding: 5,
    marginBottom: 25
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 12
  },
  toggleBtnActive: { backgroundColor: '#FFF' },
  toggleText: { color: '#FFF', fontWeight: '800', fontSize: 12 },
  toggleTextActive: { color: '#6C5CE7' },
  podium: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingHorizontal: 10,
    marginBottom: 10
  },
  topRankerItem: { alignItems: 'center', width: width * 0.28 },
  avatarContainer: { alignItems: 'center', marginBottom: 8 },
  avatarBorder: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#FFF'
  },
  crownContainer: { width: 80, height: 80, borderRadius: 40 },
  avatarInitial: { fontSize: 24, color: '#FFF', fontWeight: '900' },
  crownIcon: { position: 'absolute', top: -18 },
  rankBadgeSmall: {
    position: 'absolute',
    bottom: -5,
    backgroundColor: '#FFF',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
    elevation: 3
  },
  rankBadgeText: { fontSize: 10, fontWeight: '900', color: '#6C5CE7' },
  topName: { color: '#FFF', fontWeight: '800', fontSize: 14, marginTop: 5 },
  topScore: { color: 'rgba(255,255,255,0.9)', fontSize: 12, fontWeight: '700' },
  list: { padding: 15, paddingTop: 10 },
  rankCard: {
    backgroundColor: '#FFF',
    borderRadius: 20,
    padding: 15,
    marginBottom: 12,
    elevation: 3
  },
  myRankCard: {
    backgroundColor: '#F0EFFF',
    borderColor: '#6C5CE7',
    borderWidth: 1
  },
  mainRow: { flexDirection: 'row', alignItems: 'center' },
  rankNumBox: {
    width: 35,
    height: 35,
    borderRadius: 18,
    backgroundColor: '#F1F2F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12
  },
  rankNumText: { fontWeight: '900', color: '#A4B0BE', fontSize: 14 },
  cardInfo: { flex: 1 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  cardName: { fontSize: 16, fontWeight: '800', color: '#2D3436' },
  myText: { color: '#6C5CE7' },
  cardScoreText: { fontSize: 16, fontWeight: '900', color: '#6C5CE7' },
  statsRow: { flexDirection: 'row', gap: 15 },
  statItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statText: { fontSize: 11, color: '#636E72', fontWeight: '700' },
  expandContent: { marginTop: 10 },
  divider: { height: 1, backgroundColor: '#F1F2F6', marginBottom: 10 },
  expandTitle: { fontSize: 12, fontWeight: '800', color: '#2D3436', marginBottom: 8, marginLeft: 2 },
  secContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  secBadge: {
    backgroundColor: '#F8F9FA',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E1E2E6',
    minWidth: '45%'
  },
  secText: { fontSize: 10, color: '#636E72', fontWeight: '900' },
  secSubText: { fontSize: 8, color: '#A4B0BE', fontWeight: '700', marginTop: 2 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyState: { alignItems: 'center', marginTop: 100 },
  emptyText: { color: '#A4B0BE', fontWeight: '600', marginTop: 10 }
});
