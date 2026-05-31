import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, SafeAreaView } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';

export default function LiveTestDisclaimer() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [quizData, setQuizData] = useState(null);

  useEffect(() => {
    loadQuizInfo();
  }, []);

  const loadQuizInfo = async () => {
    try {
      const content = await FileSystem.readAsStringAsync(params.quizPath);
      const data = JSON.parse(content);

      // Calculate sections
      const sections = {};
      data.questions.forEach(q => {
        const sec = q.section || "General";
        sections[sec] = (sections[sec] || 0) + 1;
      });

      const totalQ = data.questions.length;
      let rawTime = Math.ceil(totalQ * 1.5);
      let roundedTime = Math.ceil(rawTime / 5) * 5;

      setQuizData({
        totalQuestions: totalQ,
        sections,
        timeLimit: roundedTime
      });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const startTest = () => {
    router.replace({
      pathname: '/quiz/quiz-screen',
      params: {
        category: params.category,
        fileName: params.fileName,
        mode: 'practice',
        isLive: 'true',
        timeLimit: quizData.timeLimit
      }
    });
  };

  if (loading || !quizData) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#E91E63" />
        {!quizData && !loading && <Text style={{marginTop: 10, color: '#FF4757'}}>Failed to load quiz data</Text>}
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <MaterialCommunityIcons name="arrow-left" size={28} color="#2D3436" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Test Details</Text>
      </View>

      <View style={styles.content}>
        <LinearGradient colors={['#E91E63', '#C2185B']} style={styles.heroCard}>
          <MaterialCommunityIcons name="lightning-bolt" size={40} color="#FFF" />
          <Text style={styles.heroTitle} numberOfLines={1}>{params.quizName}</Text>
          <Text style={styles.heroSub}>{params.category}</Text>
        </LinearGradient>

        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statVal}>{quizData.totalQuestions}</Text>
            <Text style={styles.statLabel}>Questions</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statVal}>{quizData.timeLimit}</Text>
            <Text style={styles.statLabel}>Minutes</Text>
          </View>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Syllabus / Sections</Text>
          <View style={styles.sectionsGrid}>
            {Object.entries(quizData.sections).map(([name, count]) => (
              <View key={name} style={styles.sectionRow}>
                <Text style={styles.sectionName} numberOfLines={1}>{name}</Text>
                <Text style={styles.sectionCount}>{count} Qs</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.disclaimerCard}>
          <View style={styles.disclaimerHeader}>
            <MaterialCommunityIcons name="alert-circle" size={20} color="#F57F17" />
            <Text style={styles.disclaimerTitle}>IMPORTANT RULES</Text>
          </View>
          <Text style={styles.disclaimerText}>
            • Timer cannot be paused.{"\n"}
            • No reattempts allowed.{"\n"}
            • Ensure stable internet connection.
          </Text>
        </View>

        <View style={styles.spacer} />

        <TouchableOpacity style={styles.startBtn} onPress={startTest}>
          <LinearGradient
              colors={['#E91E63', '#C2185B']}
              start={{x:0, y:0}} end={{x:1, y:0}}
              style={styles.startBtnGradient}
          >
            <Text style={styles.startBtnText}>START LIVE QUIZ</Text>
            <MaterialCommunityIcons name="play" size={24} color="#FFF" />
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F2F6'
  },
  backBtn: { marginRight: 15 },
  headerTitle: { fontSize: 18, fontWeight: '900', color: '#2D3436' },
  content: { flex: 1, padding: 20 },
  heroCard: {
    borderRadius: 25,
    padding: 20,
    alignItems: 'center',
    marginBottom: 15,
    elevation: 4
  },
  heroTitle: { fontSize: 20, fontWeight: '900', color: '#FFF', textAlign: 'center', marginTop: 5 },
  heroSub: { fontSize: 12, color: 'rgba(255,255,255,0.8)', fontWeight: '700' },
  statsRow: {
    flexDirection: 'row',
    backgroundColor: '#F8F9FA',
    borderRadius: 20,
    padding: 15,
    marginBottom: 15,
    alignItems: 'center'
  },
  statItem: { flex: 1, alignItems: 'center' },
  statVal: { fontSize: 20, fontWeight: '900', color: '#2D3436' },
  statLabel: { fontSize: 11, color: '#A4B0BE', fontWeight: '800' },
  statDivider: { width: 1, height: 30, backgroundColor: '#E0E0E0' },
  sectionCard: {
    backgroundColor: '#F8F9FA',
    borderRadius: 20,
    padding: 15,
    marginBottom: 15,
    flexShrink: 1
  },
  sectionTitle: { fontSize: 14, fontWeight: '900', color: '#2D3436', marginBottom: 10 },
  sectionsGrid: { maxHeight: 120 },
  sectionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#EEE'
  },
  sectionName: { fontSize: 13, color: '#636E72', fontWeight: '700', flex: 1 },
  sectionCount: { fontSize: 13, color: '#E91E63', fontWeight: '800', marginLeft: 10 },
  disclaimerCard: {
    backgroundColor: '#FFF9C4',
    borderRadius: 20,
    padding: 15,
    borderWidth: 1,
    borderColor: '#FFF176'
  },
  disclaimerHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 5 },
  disclaimerTitle: { fontSize: 12, fontWeight: '900', color: '#F57F17', marginLeft: 8 },
  disclaimerText: { fontSize: 12, color: '#795548', lineHeight: 18, fontWeight: '600' },
  spacer: { flex: 1 },
  startBtn: { marginBottom: 50 },
  startBtnGradient: {
    flexDirection: 'row',
    height: 60,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center'
  },
  startBtnText: { color: '#FFF', fontSize: 16,  fontWeight: '900', letterSpacing: 1, marginRight: 10 }
});
