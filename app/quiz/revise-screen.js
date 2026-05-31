import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import MathRenderer from '../../components/MathRenderer';

import { GITHUB_USERNAME, REPO_NAME } from '../../utils/syncService';

const REMOTE_IMAGE_BASE = `https://api.github.com/repos/${GITHUB_USERNAME}/${REPO_NAME}/contents/exam_question_images/`;

export default function ReviseScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { quizData } = useLocalSearchParams();

  let data = null;
  if (quizData && typeof quizData === 'string' && quizData.trim()) {
    try {
      data = JSON.parse(quizData.replace(/^\uFEFF/, '').trim());
    } catch (e) {
      console.error("Error parsing quizData in ReviseScreen", e);
    }
  }
  const questions = data?.questions || (Array.isArray(data) ? data : []);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [githubToken, setGithubToken] = useState(null);

  useEffect(() => {
    const fetchToken = async () => {
      const token = await AsyncStorage.getItem('github_token');
      setGithubToken(token);
    };
    fetchToken();
  }, []);

  const currentQ = questions[currentIndex];
  if (!currentQ) return null;

  const handleNext = () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
        >
          <MaterialCommunityIcons name="chevron-left" size={28} color="#2D3436" />
        </TouchableOpacity>
        <Text style={styles.topTitle}>REVISE MODE</Text>
        <View style={styles.qIndicatorBadge}>
          <Text style={styles.qIndicatorText}>{currentIndex + 1}/{questions.length}</Text>
        </View>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={[styles.scrollInside, { paddingBottom: insets.bottom + 120 }]}
      >
        <View style={styles.mainCard}>
          <View style={styles.sectionTag}>
             <Text style={styles.sectionTagText}>{currentQ.section || "GENERAL"}</Text>
          </View>

          <View style={styles.questionContainer}>
            <MathRenderer
              htmlContent={currentQ.question_text}
              questionImage={currentQ.question_image ? `${REMOTE_IMAGE_BASE}${currentQ.question_image}` : null}
              fontSize={18}
              isQuestion={true}
              githubToken={githubToken}
            />
          </View>

          <View style={styles.optionsWrapper}>
            {currentQ.options.map((option, index) => {
              const isRight = currentQ.correct_answer === option;

              return (
                <View key={index} style={[styles.optionCard, isRight && styles.optionCorrect]}>
                  <View style={[styles.indicator, isRight && styles.indicatorCorrect]}>
                     {isRight && <MaterialCommunityIcons name="check" size={14} color="#FFF" />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <MathRenderer
                      htmlContent={option}
                      fontSize={15}
                      isQuestion={false}
                      githubToken={githubToken}
                    />
                  </View>
                </View>
              );
            })}
          </View>
        </View>

        {currentQ.solution && (
          <View style={styles.solutionCard}>
            <View style={styles.solutionHeader}>
              <View style={styles.solIcon}>
                <MaterialCommunityIcons name="lightbulb-variant" size={20} color="#FF9800" />
              </View>
              <Text style={styles.solutionTitle}>SOLUTION</Text>
            </View>
            <View style={styles.solContent}>
              <MathRenderer
                htmlContent={currentQ.solution}
                fontSize={15}
                isQuestion={false}
                githubToken={githubToken}
              />
            </View>
          </View>
        )}
      </ScrollView>

      <View style={[styles.bottomNav, { paddingBottom: insets.bottom + 15 }]}>
        <TouchableOpacity
          onPress={handlePrev}
          disabled={currentIndex === 0}
          style={[styles.navBtn, styles.prevBtn, currentIndex === 0 && { opacity: 0.3 }]}
        >
          <Text style={styles.navBtnText}>PREVIOUS</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => currentIndex === questions.length - 1 ? router.back() : handleNext()}
          style={[styles.navBtn, styles.nextBtn, currentIndex === questions.length - 1 && { backgroundColor: '#4A90E2' }]}
        >
          <Text style={[styles.navBtnText, { color: '#FFF' }]}>
            {currentIndex === questions.length - 1 ? 'FINISH' : 'NEXT'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0'
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#F1F2F6',
    justifyContent: 'center',
    alignItems: 'center'
  },
  topTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#2D3436',
    letterSpacing: 1,
    flex: 1,
    textAlign: 'center'
  },
  qIndicatorBadge: {
    backgroundColor: '#2D3436',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  qIndicatorText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#FFF'
  },
  content: { flex: 1 },
  scrollInside: { padding: 20 },
  mainCard: {
    backgroundColor: '#FFF',
    borderRadius: 30,
    padding: 20,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    marginBottom: 15
  },
  sectionTag: {
    alignSelf: 'flex-start',
    backgroundColor: '#F1F2F6',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    marginBottom: 15
  },
  sectionTagText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#636E72',
    textTransform: 'uppercase'
  },
  questionContainer: { marginBottom: 15 },
  optionsWrapper: { gap: 8 },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 20,
    backgroundColor: '#F8F9FA',
    borderWidth: 1,
    borderColor: '#F0F0F0'
  },
  optionCorrect: {
    borderColor: '#4CAF50',
    backgroundColor: '#F1F9F1',
    borderWidth: 2
  },
  indicator: {
    width: 24,
    height: 24,
    borderRadius: 12,
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#D1D8E0'
  },
  indicatorCorrect: {
    backgroundColor: '#4CAF50'
  },
  solutionCard: {
    backgroundColor: '#FFF',
    borderRadius: 30,
    padding: 25,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    borderLeftWidth: 5,
    borderLeftColor: '#4A90E2'
  },
  solutionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15
  },
  solIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#E8F2FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10
  },
  solutionTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: '#4A90E2',
    letterSpacing: 1
  },
  solContent: {
    opacity: 0.8
  },
  bottomNav: {
    flexDirection: 'row',
    padding: 20,
    backgroundColor: '#FFF',
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    gap: 15
  },
  navBtn: {
    flex: 1,
    paddingVertical: 16,
    alignItems: 'center',
    borderRadius: 20,
    elevation: 2
  },
  prevBtn: {
    backgroundColor: '#F1F2F6'
  },
  nextBtn: {
    backgroundColor: '#2D3436'
  },
  navBtnText: {
    fontWeight: '900',
    color: '#2D3436',
    fontSize: 14,
    letterSpacing: 1
  }
});
