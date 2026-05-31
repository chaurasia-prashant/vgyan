import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert, Modal, TextInput, AppState } from 'react-native';
import { useRouter } from 'expo-router';
import { useRef } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSafeRootDir, sanitizeName } from '../utils/fileManager';
import { LinearGradient } from 'expo-linear-gradient';
import { syncAppStatus, pullAppStatus, GITHUB_TOKEN, USERS_FILE_URL, LEADERBOARD_FILE_URL, b64_decode, b64_encode, getUserDataUrl, GITHUB_USERNAME, REPO_NAME } from '../utils/syncService';
import { trackActivity } from '../utils/analyticsManager';

// GitHub Configuration
const COMMITS_URL = `https://api.github.com/repos/${GITHUB_USERNAME}/${REPO_NAME}/commits?per_page=1`;

export default function Dashboard() {
  const router = useRouter();
  const [isReady, setIsReady] = useState(false);
  const [hasNewUpdates, setHasNewUpdates] = useState(false);
  const [syncModalVisible, setSyncModalVisible] = useState(false);
  const [syncProgress, setSyncProgress] = useState(0);
  const [syncStatus, setSyncStatus] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [userName, setUserName] = useState('');
  const [userAccess, setUserAccess] = useState('');
  const [userPassword, setUserPassword] = useState('');
  const [isAllowed, setIsAllowed] = useState(false);
  const [isUserModalVisible, setIsUserModalVisible] = useState(false);
  const [isLoginMode, setIsLoginMode] = useState(false);
  const [isSignOutModalVisible, setIsSignOutModalVisible] = useState(false);
  const [tempName, setTempName] = useState('');
  const [tempPassword, setTempPassword] = useState('');

  const [isAccessModalVisible, setIsAccessModalVisible] = useState(false);
  const [isSuccessModalVisible, setIsSuccessModalVisible] = useState(false);
  const [isAuthSuccessModalVisible, setIsAuthSuccessModalVisible] = useState(false);
  const [isErrorModalVisible, setIsErrorModalVisible] = useState(false);
  const [isCreatePasswordModalVisible, setIsCreatePasswordModalVisible] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [isCheckingName, setIsCheckingName] = useState(false);
  const [nameError, setNameError] = useState('');
  const [passError, setPassError] = useState('');
  const [sessionStartTime, setSessionStartTime] = useState(Date.now());
  const appState = useRef(AppState.currentState);

  const showError = (msg) => {
    setErrorMessage(msg);
    setIsErrorModalVisible(true);
  };

  useEffect(() => {
    checkUser();
    initializeStorage();
    checkForUpdates();
    // Ensure token is available for other screens
    AsyncStorage.setItem('github_token', GITHUB_TOKEN);

    // Sync status when app returns to foreground or on load
    pullAppStatus();

    const subscription = AppState.addEventListener('change', nextAppState => {
      if (appState.current.match(/active/) && nextAppState.match(/inactive|background/)) {
        // App is going to background, save activity
        const minutes = Math.floor((Date.now() - sessionStartTime) / 60000);
        if (minutes > 0) {
          const { updateActivityMinutes } = require('../utils/analyticsManager');
          updateActivityMinutes(minutes).then(() => {
             syncAppStatus();
          });
        }
      } else if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        // App returned to foreground, reset start time
        setSessionStartTime(Date.now());
        pullAppStatus();
      }
      appState.current = nextAppState;
    });

    return () => {
      subscription.remove();
    };
  }, [sessionStartTime]);

  const handleSignOut = () => {
    setIsSignOutModalVisible(true);
  };

  const performSignOut = async () => {
    setIsSignOutModalVisible(false);
    setSyncStatus('Syncing progress...');
    setSyncModalVisible(true);
    setIsSyncing(true);

    // Track activity before signout
    const { updateActivityMinutes } = require('../utils/analyticsManager');
    const minutes = Math.floor((Date.now() - sessionStartTime) / 60000);
    await updateActivityMinutes(minutes);

    await syncAppStatus(true);

    const keys = await AsyncStorage.getAllKeys();
    const keysToRemove = keys.filter(key => key !== 'last_synced_sha' && key !== 'file_shas' && key !== 'github_token');
    await AsyncStorage.multiRemove(keysToRemove);

    setSyncModalVisible(false);
    setIsSyncing(false);
    setUserName('');
    setUserAccess('');
    setUserPassword('');
    setIsAllowed(false);
    setIsUserModalVisible(true);
  };

  const syncUserAccess = async (name, access, password) => {
    try {
      const res = await fetch(`${USERS_FILE_URL}?t=${new Date().getTime()}`, {
        headers: { 'Authorization': `Bearer ${GITHUB_TOKEN}`, 'Accept': 'application/vnd.github.v3+json' }
      });
      if (!res.ok) return;

      const data = await res.json();
      const decodedContent = b64_decode(data.content.replace(/\s/g, ''));
      if (!decodedContent || !decodedContent.trim()) return;

      let sanitizedDecoded = decodedContent.replace(/^\uFEFF/, '').trim();
      sanitizedDecoded = sanitizedDecoded.replace(/,\s*\]$/, ']');
      const users = JSON.parse(sanitizedDecoded);
      const userEntry = users.find(u =>
        u.username.toLowerCase().trim() === name.toLowerCase().trim() &&
        u.access === access
      );

      const userDataUrl = getUserDataUrl(name);
      const resStatus = await fetch(`${userDataUrl}?t=${new Date().getTime()}`, {
        headers: { 'Authorization': `Bearer ${GITHUB_TOKEN}`, 'Accept': 'application/vnd.github.v3+json' }
      });

      if (resStatus.ok) {
        const statusData = await resStatus.json();
        const decodedStatus = b64_decode(statusData.content.replace(/\s/g, ''));
        if (decodedStatus && decodedStatus.trim()) {
          const statusObj = JSON.parse(decodedStatus.replace(/^\uFEFF/, '').trim());
          if (statusObj.current_progress) {
            await AsyncStorage.setItem('learn_progress', JSON.stringify(statusObj.current_progress));

            // Reconstruct live_quiz_history from current_progress
            const liveHistory = {};
            Object.entries(statusObj.current_progress).forEach(([key, val]) => {
              if (key.startsWith('live_')) {
                // Key format is live_Category_FileName
                // We need the full path for LiveTestSeries.js: LiveTest/Category/FileName
                const parts = key.split('_');
                if (parts.length >= 3) {
                  const category = parts[1];
                  const fileName = parts.slice(2).join('_');
                  const fullPath = `LiveTest/${category}/${fileName}`;
                  // Note: getSafeRootDir() will be prepended by LiveTestSeries.js logic
                  // So we store the relative path portion that matches what handleFinish generates
                  // Actually, handleFinish uses: `${liveRoot}${category}/${fileName}`
                  // We'll store a simplified version and adjust LiveTestSeries to be more robust
                  liveHistory[key] = val;
                }
              }
            });
            if (Object.keys(liveHistory).length > 0) {
              await AsyncStorage.setItem('live_quiz_history', JSON.stringify(liveHistory));
            }
          }
        }
      }

      if (userEntry) {
        const cloudAllow = true;
        setIsAllowed(cloudAllow);
        await AsyncStorage.setItem('user_allow', cloudAllow.toString());

        if (cloudAllow) {
          setIsAccessModalVisible(false);
        } else {
          setIsAccessModalVisible(true);
        }
      }

      // Fetch cloud progress and analytics
      await pullAppStatus();
    } catch (e) {}
  };

  const checkUser = async () => {
    try {
      const savedName = await AsyncStorage.getItem('user_name');
      const savedAccess = await AsyncStorage.getItem('user_access');
      const savedAllow = await AsyncStorage.getItem('user_allow');
      const savedPass = await AsyncStorage.getItem('user_password');

      if (savedName && savedAccess) {
        const normalizedName = savedName.toUpperCase().trim();
        const allowed = true;

        setUserName(savedName);
        setUserAccess(savedAccess);
        setIsAllowed(allowed);

        // Explicitly set access modal visibility based on allowed status
        if (allowed) {
          setIsAccessModalVisible(false);
        } else {
          setIsAccessModalVisible(true);
        }

        if (!savedPass) {
          setIsCreatePasswordModalVisible(true);
        } else {
          setUserPassword(savedPass);
        }

        syncUserAccess(savedName, savedAccess, savedPass);
      } else {
        setIsUserModalVisible(true);
      }
    } catch (e) { }
  };

  const handleSaveName = async () => {
    const trimmed = tempName.trim();
    const pass = tempPassword.trim();

    if (!trimmed) {
      setNameError("Name is required");
      return;
    }
    if (trimmed.includes(' ')) {
      setNameError("One word only (no spaces)");
      return;
    }
    if (pass.length < 5) {
      setPassError("Password must be at least 5 chars");
      return;
    }

    setNameError('');
    setPassError('');
    setIsCheckingName(true);

    try {
      let currentUsers = [];
      let sha = null;

      const res = await fetch(USERS_FILE_URL, {
        headers: { 'Authorization': `Bearer ${GITHUB_TOKEN}`, 'Accept': 'application/vnd.github.v3+json' }
      });

      if (res.ok) {
        const data = await res.json();
        sha = data.sha;
        const decodedContent = b64_decode(data.content.replace(/\s/g, ''));
        if (decodedContent && decodedContent.trim()) {
           let sanitizedDecoded = decodedContent.replace(/^\uFEFF/, '').trim();
           sanitizedDecoded = sanitizedDecoded.replace(/,\s*\]$/, ']');
           currentUsers = JSON.parse(sanitizedDecoded);
        }
      }

      // Check if username already exists
      const userExists = currentUsers.some(u => u.username.toLowerCase() === trimmed.toLowerCase());
      if (userExists) {
        setIsCheckingName(false);
        setNameError("Username already taken");
        return;
      }

      // Name is unique, now start the registration process
      const hash = Math.random().toString(36).substring(2, 10).toUpperCase();

      currentUsers.push({
        username: trimmed,
        password: pass,
        access: hash,
        allow: true, // Automatically authorize all users
        date: new Date().toISOString()
      });

      // Now hide user modal and show sync modal for the GitHub update
      setIsCheckingName(false);
      setIsUserModalVisible(false);

      // Delay slightly for smooth modal transition
      setTimeout(async () => {
        setSyncModalVisible(true);
        setIsSyncing(true);
        setSyncStatus('Registering on cloud...');
        setSyncProgress(0.5);

        try {
          const updateRes = await fetch(USERS_FILE_URL, {
            method: 'PUT',
            headers: {
              'Authorization': `Bearer ${GITHUB_TOKEN}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              message: `Register user: ${trimmed}`,
              content: b64_encode(JSON.stringify(currentUsers, null, 2)),
              sha: sha || undefined
            })
          });

          if (!updateRes.ok) throw new Error("Update failed");

          await AsyncStorage.setItem('user_name', trimmed);
          await AsyncStorage.setItem('user_access', hash);
          await AsyncStorage.setItem('user_password', pass);
          await AsyncStorage.setItem('user_allow', 'true');
          await AsyncStorage.setItem('github_token', GITHUB_TOKEN);
          setUserName(trimmed);
          setUserAccess(hash);
          setUserPassword(pass);
          setIsAllowed(true);

          setSyncStatus('Access Granted!');

          setSyncProgress(1);
          setTimeout(() => {
            setSyncModalVisible(false);
            setIsSyncing(false);
            setIsAuthSuccessModalVisible(true);
          }, 1500);
        } catch (e) {
          setSyncStatus('Registration failed.');
          setIsSyncing(false);
          showError("Cloud registration failed. Please check your connection.");
          setIsUserModalVisible(true);
        }
      }, 400);

    } catch (e) {
      setIsCheckingName(false);
      showError("Connection failed. Please check your internet.");
    }
  };

  const handleLogin = async () => {
    const trimmed = tempName.trim();
    const pass = tempPassword.trim();

    if (!trimmed || !pass) {
      setNameError("Name and Password are required");
      return;
    }

    setNameError('');
    setPassError('');
    setIsCheckingName(true);

    try {
      const res = await fetch(`${USERS_FILE_URL}?t=${new Date().getTime()}`, {
        headers: { 'Authorization': `Bearer ${GITHUB_TOKEN}`, 'Accept': 'application/vnd.github.v3+json' }
      });

      if (!res.ok) throw new Error("Connection failed");

      const data = await res.json();
      const decodedContent = b64_decode(data.content.replace(/\s/g, ''));
      if (!decodedContent || !decodedContent.trim()) throw new Error("Registry is empty");

      let sanitizedDecoded = decodedContent.replace(/^\uFEFF/, '').trim();
      sanitizedDecoded = sanitizedDecoded.replace(/,\s*\]$/, ']');
      const users = JSON.parse(sanitizedDecoded);

      const userEntry = users.find(u => u.username.toLowerCase() === trimmed.toLowerCase());

      if (!userEntry) {
        setIsCheckingName(false);
        setNameError("User not registered");
        return;
      }

      if (userEntry.password !== pass) {
        setIsCheckingName(false);
        setPassError("Incorrect password");
        return;
      }

      // Login success
      const cloudAllow = true;

      await AsyncStorage.setItem('user_name', userEntry.username);
      await AsyncStorage.setItem('user_access', userEntry.access);
      await AsyncStorage.setItem('user_password', userEntry.password);
      await AsyncStorage.setItem('user_allow', cloudAllow.toString());

      setUserName(userEntry.username);
      setUserAccess(userEntry.access);
      setUserPassword(userEntry.password);
      setIsAllowed(cloudAllow);

      setIsUserModalVisible(false);
      setIsCheckingName(false);

      if (cloudAllow) {
        setIsAuthSuccessModalVisible(true);
      } else {
        setIsAccessModalVisible(true);
      }

      // 1. Download user analytics first to restore leaderboard progress
      await downloadUserAnalytics(userEntry.username);

      // 2. Then sync progress and user access
      await syncUserAccess(userEntry.username, userEntry.access, userEntry.password);

    } catch (e) {
      setIsCheckingName(false);
      showError("Login failed. Check your internet connection.");
    }
  };

  const downloadUserAnalytics = async (username) => {
    try {
      const res = await fetch(`${LEADERBOARD_FILE_URL}?t=${new Date().getTime()}`, {
        headers: { 'Authorization': `Bearer ${GITHUB_TOKEN}`, 'Accept': 'application/vnd.github.v3+json' }
      });

      if (res.ok) {
        const data = await res.json();
        const decoded = b64_decode(data.content.replace(/\s/g, ''));
        const leaderboard = JSON.parse(decoded);
        const userData = leaderboard.find(u => u.username === username);

        if (userData) {
          await AsyncStorage.setItem('user_analytics', JSON.stringify(userData));
          if (userData.data_date) {
            await AsyncStorage.setItem('analytics_week_range', userData.data_date);
          }
        }
      }
    } catch (e) {
      console.error("Failed to download user analytics", e);
    }
  };

  const handleCreatePassword = async () => {
    const pass = tempPassword.trim();
    if (pass.length < 5) {
      setPassError("Minimum 5 characters");
      return;
    }

    setIsCheckingName(true);
    try {
      const res = await fetch(`${USERS_FILE_URL}?t=${new Date().getTime()}`, {
        headers: { 'Authorization': `Bearer ${GITHUB_TOKEN}`, 'Accept': 'application/vnd.github.v3+json' }
      });
      if (!res.ok) throw new Error("Connection failed");
      const data = await res.json();
      const decoded = b64_decode(data.content.replace(/\s/g, ''));
      if (!decoded || !decoded.trim()) throw new Error("Registry is empty");

      let sanitizedDecoded = decoded.replace(/^\uFEFF/, '').trim();
      // Remove trailing comma in array if it exists
      sanitizedDecoded = sanitizedDecoded.replace(/,\s*\]$/, ']');

      const users = JSON.parse(sanitizedDecoded);
      const userIndex = users.findIndex(u => u.username.toLowerCase().trim() === userName.toLowerCase().trim() && u.access === userAccess);
      if (userIndex === -1) throw new Error("User not found");

      users[userIndex].password = pass;

      const updateRes = await fetch(USERS_FILE_URL, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${GITHUB_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `Update password for ${userName}`,
          content: b64_encode(JSON.stringify(users, null, 2)),
          sha: data.sha
        })
      });

      if (!updateRes.ok) throw new Error("Cloud update failed");

      await AsyncStorage.setItem('user_password', pass);
      setUserPassword(pass);
      setIsCreatePasswordModalVisible(false);
      Alert.alert("Success", "Password created successfully!");
      checkUser();
    } catch (e) {
      showError(e.message);
    } finally {
      setIsCheckingName(false);
    }
  };

  const handleVerifyAccess = async () => {
    if (!userName || !userAccess) {
      Alert.alert("Error", "User data not found. Please try restarting the app.");
      return;
    }

    setIsVerifying(true);
    try {
      // Add timestamp to bypass GitHub API cache
      const res = await fetch(`${USERS_FILE_URL}?t=${new Date().getTime()}`, {
        headers: { 'Authorization': `Bearer ${GITHUB_TOKEN}`, 'Accept': 'application/vnd.github.v3+json' }
      });
      if (!res.ok) throw new Error("Connection error");

      const data = await res.json();
      const decodedContent = b64_decode(data.content.replace(/\s/g, ''));
      if (!decodedContent || !decodedContent.trim()) throw new Error("Registry empty");

      let sanitizedDecoded = decodedContent.replace(/^\uFEFF/, '').trim();
      sanitizedDecoded = sanitizedDecoded.replace(/,\s*\]$/, ']');
      const users = JSON.parse(sanitizedDecoded);
      // Case-insensitive comparison for username
      const userEntry = users.find(u =>
        u.username.toLowerCase().trim() === userName.toLowerCase().trim() &&
        u.access === userAccess
      );

      if (userEntry) {
        await AsyncStorage.setItem('user_allow', 'true');
        setIsAllowed(true);
        setIsAccessModalVisible(false);
        setTimeout(() => {
          setIsAuthSuccessModalVisible(true);
        }, 500);
      } else {
        showError("Authentication failed. Please check your credentials.");
      }
    } catch (e) {
      showError("Could not connect to server. Please check your internet.");
    } finally {
      setIsVerifying(false);
    }
  };

  const initializeStorage = async () => {
    try {
      const root = getSafeRootDir();
      if (!root) {
        setIsReady(true);
        return;
      }
      const rootInfo = await FileSystem.getInfoAsync(root);
      if (!rootInfo.exists) {
        await FileSystem.makeDirectoryAsync(root, { intermediates: true });
      }
      setIsReady(true);
    } catch (e) {
      setIsReady(true);
    }
  };

  const checkForUpdates = async () => {
    try {
      const response = await fetch(COMMITS_URL, {
        headers: {
          'Authorization': `Bearer ${GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });
      if (!response.ok) return;
      const commits = await response.json();
      if (commits && commits.length > 0) {
        const latestSha = commits[0].sha;
        const savedSha = await AsyncStorage.getItem('last_synced_sha');
        if (savedSha !== latestSha) {
          setHasNewUpdates(true);
        }
      }
    } catch (e) { }
  };

  const handleGlobalSync = async () => {
    setSyncModalVisible(true);
    setIsSyncing(true);
    setSyncProgress(0);
    setSyncStatus('Verifying access...');

    try {
      // Add timestamp to bypass GitHub API cache
      const verifyRes = await fetch(`${USERS_FILE_URL}?t=${new Date().getTime()}`, {
        headers: { 'Authorization': `Bearer ${GITHUB_TOKEN}`, 'Accept': 'application/vnd.github.v3+json' }
      });

      if (!verifyRes.ok) throw new Error("Verification failed");

      const verifyData = await verifyRes.json();
      const decodedContent = b64_decode(verifyData.content.replace(/\s/g, ''));
      if (!decodedContent || !decodedContent.trim()) throw new Error("Registry is empty");

      let sanitizedDecoded = decodedContent.replace(/^\uFEFF/, '').trim();
      sanitizedDecoded = sanitizedDecoded.replace(/,\s*\]$/, ']');
      const users = JSON.parse(sanitizedDecoded);
      // Case-insensitive comparison for username
      const userEntry = users.find(u =>
        u.username.toLowerCase().trim() === userName.toLowerCase().trim() &&
        u.access === userAccess
      );

      if (!userEntry) {
        await AsyncStorage.setItem('user_allow', 'false');
        setIsAllowed(false);
        setSyncStatus('Access Denied');
        setIsSyncing(false);
        setSyncModalVisible(false);
        showError("Your access token is invalid or has been revoked.");
        return;
      }

      // If we reach here, user is verified and allowed
      await AsyncStorage.setItem('user_allow', 'true');
      setIsAllowed(true);

      // --- OPTIMIZATION: Check if we actually need to download anything ---
      const commitRes = await fetch(COMMITS_URL, {
        headers: { 'Authorization': `Bearer ${GITHUB_TOKEN}`, 'Accept': 'application/vnd.github.v3+json' }
      });
      const commits = await commitRes.json();
      const latestSha = commits[0]?.sha;
      const savedSha = await AsyncStorage.getItem('last_synced_sha');

      if (latestSha && savedSha === latestSha) {
        setSyncStatus('Everything is up to date');
        setSyncProgress(1);
        setHasNewUpdates(false);
        setTimeout(() => {
          setSyncModalVisible(false);
          setIsSyncing(false);
        }, 1500);
        return;
      }
      // --------------------------------------------------------------------

      setSyncStatus('Access Verified. Checking Exams...');
      setSyncProgress(0.1);

      const savedFileShas = JSON.parse(await AsyncStorage.getItem('file_shas') || '{}');
      const newFileShas = { ...savedFileShas };

      const examRoot = getSafeRootDir(); // .../ExamList/
      const learnRoot = examRoot.replace('ExamList/', 'Learn/');
      const liveRoot = examRoot.replace('ExamList/', 'LiveTest/');

      // Folder Configuration
      const examFolder = "exam_files";
      const exerciseFolder = "exercise_files";
      const liveFolder = "live_test";

      const examFilesUrl = `https://api.github.com/repos/${GITHUB_USERNAME}/${REPO_NAME}/contents/${examFolder}`;
      const exerciseFilesUrl = `https://api.github.com/repos/${GITHUB_USERNAME}/${REPO_NAME}/contents/${exerciseFolder}`;
      const liveFilesUrl = `https://api.github.com/repos/${GITHUB_USERNAME}/${REPO_NAME}/contents/${liveFolder}`;

      // Ensure directories exist
      const examInfo = await FileSystem.getInfoAsync(examRoot);
      if (!examInfo.exists) await FileSystem.makeDirectoryAsync(examRoot, { intermediates: true });

      const learnInfo = await FileSystem.getInfoAsync(learnRoot);
      if (!learnInfo.exists) await FileSystem.makeDirectoryAsync(learnRoot, { intermediates: true });

      const liveInfo = await FileSystem.getInfoAsync(liveRoot);
      if (!liveInfo.exists) await FileSystem.makeDirectoryAsync(liveRoot, { intermediates: true });

      const syncFolder = async (baseUrl, targetRoot, startProgress, endProgress) => {
        const response = await fetch(baseUrl, {
          headers: { 'Authorization': `Bearer ${GITHUB_TOKEN}`, 'Accept': 'application/vnd.github.v3+json' }
        });

        if (!response.ok) {
          console.warn(`Failed to fetch base URL ${baseUrl}: ${response.status}`);
          return;
        }

        const items = await response.json();
        if (!Array.isArray(items)) {
           console.warn(`Items is not an array for ${baseUrl}`, items);
           return;
        }

        const dirs = items.filter(i => i.type === 'dir');
        const totalDirs = dirs.length;

        // If no directories found, maybe files are directly in this folder?
        if (totalDirs === 0) {
           const files = items.filter(i => i.type === 'file' && i.name.toLowerCase().endsWith('.json'));
           if (files.length > 0) {
             const defaultDir = `${targetRoot}General/`;
             const defaultInfo = await FileSystem.getInfoAsync(defaultDir);
             if (!defaultInfo.exists) await FileSystem.makeDirectoryAsync(defaultDir, { intermediates: true });

             for (const file of files) {
               await downloadFile(file, defaultDir);
             }
           }
           return;
        }

        let processedDirs = 0;

        for (const item of dirs) {
          setSyncStatus(`Downloading ${item.name}...`);
          const categoryDir = `${targetRoot}${sanitizeName(item.name)}/`;
          const dirInfo = await FileSystem.getInfoAsync(categoryDir);
          if (!dirInfo.exists) await FileSystem.makeDirectoryAsync(categoryDir, { intermediates: true });

          const fileRes = await fetch(item.url, {
            headers: { 'Authorization': `Bearer ${GITHUB_TOKEN}`, 'Accept': 'application/vnd.github.v3+json' }
          });

          if (fileRes.ok) {
            const files = await fileRes.json();
            if (Array.isArray(files)) {
              for (const file of files) {
                await downloadFile(file, categoryDir);
              }
            }
          }

          processedDirs++;
          const currentProgress = startProgress + (processedDirs / totalDirs) * (endProgress - startProgress);
          setSyncProgress(currentProgress);
        }
      };

      const downloadFile = async (file, targetDir) => {
        if (file.name.toLowerCase().endsWith('.json')) {
          const filePath = `${targetDir}${file.name}`;
          const fileInfo = await FileSystem.getInfoAsync(filePath);

          // OPTIMIZATION: Use GitHub SHA to skip unchanged files
          if (fileInfo.exists && savedFileShas[filePath] === file.sha) {
            newFileShas[filePath] = file.sha; // Keep it in the new list
            return;
          }

          const fileContentRes = await fetch(file.url, {
            headers: {
              'Authorization': `Bearer ${GITHUB_TOKEN}`,
              'Accept': 'application/vnd.github.v3.raw'
            }
          });

          if (fileContentRes.ok) {
            const content = await fileContentRes.text();
            if (content) {
              await FileSystem.writeAsStringAsync(filePath, content);
              newFileShas[filePath] = file.sha;
            }
          }
        }
      };

      setSyncStatus('Checking Exams...');
      await syncFolder(examFilesUrl, examRoot, 0, 0.5);

      setSyncStatus('Checking Exercises...');
      await syncFolder(exerciseFilesUrl, learnRoot, 0.6, 0.8);

      setSyncStatus('Checking Live Tests...');
      await syncFolder(liveFilesUrl, liveRoot, 0.8, 0.95);

      // Save SHA
      if (commits && commits.length > 0) {
        await AsyncStorage.setItem('last_synced_sha', commits[0].sha);
      }

      // Save file SHAs for the next sync
      await AsyncStorage.setItem('file_shas', JSON.stringify(newFileShas));

      setSyncProgress(1);
      setSyncStatus('SUCCESS: All Files Are Ready');
      setHasNewUpdates(false);
      setIsSyncing(false);

    } catch (e) {
      setSyncStatus('Sync failed.');
      setIsSyncing(false);
      setSyncModalVisible(false);
      showError("Network request failed! Please check your internet connection and try again.");
    }
  };

  const MenuCard = ({ title, description, icon, color, route }) => {
    const isActuallyAllowed = isAllowed;
    return (
      <TouchableOpacity
        style={[styles.squareCard, { shadowColor: color }]}
        onPress={() => {
          if (isActuallyAllowed) {
            router.push(route);
          } else {
            setIsAccessModalVisible(true);
          }
        }}
        activeOpacity={0.8}
        disabled={!isReady}
      >
        <View style={[styles.squareIconBox, { backgroundColor: color + '15' }]}>
          <MaterialCommunityIcons name={icon} size={32} color={color} />
        </View>
        <Text style={styles.squareTitle}>{title.toUpperCase()}</Text>
        <Text style={styles.squareDesc}>{description}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={styles.appTitle}>VGYAN</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity
                style={styles.syncButton}
                onPress={handleSignOut}
              >
                <MaterialCommunityIcons name="logout" size={24} color="#FF4757" />
              </TouchableOpacity>
            </View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 30 }}>
            <Text style={[styles.appSub, { marginTop: 0 }]}>WELCOME {userName.toUpperCase() || 'STUDENT'}</Text>
          </View>
        </View>

        <View style={styles.squareGrid}>
          <MenuCard
            title="Live Quiz"
            description="Speed Test"
            icon="lightning-bolt"
            color="#E91E63"
            route="/quiz/live-test-series"
          />
          <MenuCard
            title="Test Series"
            description="Access your exams"
            icon="play-circle"
            color="#4CAF50"
            route="/quiz/select-exam"
          />
          <MenuCard
            title="Learn"
            description="Topic practice"
            icon="book-open-page-variant"
            color="#2196F3"
            route="/learn/select-learn"
          />
          <MenuCard
            title="History"
            description="Your attempts"
            icon="history"
            color="#FF9800"
            route="/history"
          />
          <MenuCard
            title="Statistics"
            description="Performance"
            icon="chart-areaspline"
            color="#9C27B0"
            route="/stats"
          />
          <MenuCard
            title="Leaderboard"
            description="Global Ranking"
            icon="trophy"
            color="#8D6E63"
            route="/quiz/leaderboard"
          />
        </View>
      </ScrollView>

      {/* Floating Sync Button */}
      <TouchableOpacity
        style={[
          styles.floatingSyncBtn,
          hasNewUpdates && { backgroundColor: '#E8F5E9', borderColor: '#2ECC71' }
        ]}
        onPress={handleGlobalSync}
      >
        <MaterialCommunityIcons
          name="sync"
          size={28}
          color={hasNewUpdates ? "#2ECC71" : "#4A90E2"}
        />
        {hasNewUpdates && <View style={styles.updateDot} />}
      </TouchableOpacity>

      {/* Error Modal */}
      <Modal visible={isErrorModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <LinearGradient
            colors={['#FFFFFF', '#FFF5F5']}
            style={styles.errorModalContent}
          >
            <View style={styles.errorIconCircle}>
              <MaterialCommunityIcons name="wifi-off" size={50} color="#FF4757" />
            </View>
            <Text style={styles.errorModalTitle}>Connection Error</Text>
            <Text style={styles.errorModalText}>{errorMessage}</Text>
            <TouchableOpacity
              style={styles.errorCloseBtn}
              onPress={() => setIsErrorModalVisible(false)}
            >
              <Text style={styles.errorCloseBtnText}>RETRY</Text>
            </TouchableOpacity>
          </LinearGradient>
        </View>
      </Modal>

      {/* Sync Progress Modal */}
      <Modal visible={syncModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{syncStatus}</Text>
            <View style={styles.progressContainer}>
              <View style={[styles.progressBar, { width: `${syncProgress * 100}%` }]} />
            </View>
            <Text style={styles.progressPercent}>{Math.round(syncProgress * 100)}%</Text>
            {!isSyncing && (
              <TouchableOpacity
                style={styles.closeBtn}
                onPress={() => setSyncModalVisible(false)}
              >
                <Text style={styles.closeBtnText}>Close</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>

      {/* Access Denied Modal */}
      <Modal visible={isAccessModalVisible} transparent animationType="fade" onRequestClose={() => {}}>
        <View style={styles.modalOverlay}>
          <LinearGradient
            colors={['#FFFFFF', '#F8F9FA']}
            style={styles.accessModalContent}
          >
            <View style={styles.lockIconCircle}>
              <MaterialCommunityIcons name="lock-clock" size={50} color="#FF4757" />
            </View>
            <Text style={styles.accessModalTitle}>Access Pending</Text>
            <Text style={styles.accessModalText}>
              Currently you don't have access to VGYAN, wait for the admin approval.
            </Text>
            <TouchableOpacity
              style={[styles.accessCloseBtn, isVerifying && { opacity: 0.7 }]}
              onPress={handleVerifyAccess}
              disabled={isVerifying}
            >
              {isVerifying ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.accessCloseBtnText}>VERIFY ACCESS</Text>
              )}
            </TouchableOpacity>
          </LinearGradient>
        </View>
      </Modal>

      {/* Auth Success Modal */}
      <Modal visible={isAuthSuccessModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <LinearGradient
            colors={['#FFFFFF', '#F8F9FA']}
            style={styles.successModalContent}
          >
            <View style={styles.successIconCircle}>
              <MaterialCommunityIcons name="shield-check" size={50} color="#2ECC71" />
            </View>
            <Text style={styles.successModalTitle}>Access Granted!</Text>
            <Text style={styles.successModalText}>
              Congratulations! Your account has been verified and authorized. You can now explore all VGYAN features.
            </Text>
            <TouchableOpacity
              style={styles.successCloseBtn}
              onPress={() => setIsAuthSuccessModalVisible(false)}
            >
              <Text style={styles.successCloseBtnText}>LET'S START</Text>
            </TouchableOpacity>
          </LinearGradient>
        </View>
      </Modal>

      {/* Success Modal */}
      <Modal visible={isSuccessModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <LinearGradient
            colors={['#FFFFFF', '#F8F9FA']}
            style={styles.successModalContent}
          >
            <View style={styles.successIconCircle}>
              <MaterialCommunityIcons name="check-decagram" size={50} color="#2ECC71" />
            </View>
            <Text style={styles.successModalTitle}>Request Submitted</Text>
            <Text style={styles.successModalText}>
              Your access request has been submitted for approval. Once reviewed, you will be able to explore the VGYAN content.
            </Text>
            <TouchableOpacity
              style={styles.successCloseBtn}
              onPress={() => setIsSuccessModalVisible(false)}
            >
              <Text style={styles.successCloseBtnText}>CONTINUE</Text>
            </TouchableOpacity>
          </LinearGradient>
        </View>
      </Modal>

      {/* Sign Out Confirmation Modal */}
      <Modal visible={isSignOutModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <LinearGradient
            colors={['#FFFFFF', '#FFFBFA']}
            style={[styles.accessModalContent, { paddingBottom: 20 }]}
          >
            <View style={[styles.lockIconCircle, { backgroundColor: '#FFF5F5', borderColor: '#FFEBEB', elevation: 0 }]}>
              <MaterialCommunityIcons name="power" size={50} color="#FF4757" />
            </View>

            <Text style={[styles.accessModalTitle, { color: '#FF4757', fontSize: 24 }]}>Sign Out?</Text>
            <Text style={[styles.accessModalText, { marginBottom: 30, paddingHorizontal: 10 }]}>
              Your progress will be securely synced to the cloud before you leave.
            </Text>

            <View style={{ width: '100%', gap: 10 }}>
              <TouchableOpacity
                style={[styles.accessCloseBtn, {
                  backgroundColor: '#FF4757',
                  flexDirection: 'row',
                  justifyContent: 'center',
                  paddingVertical: 18,
                  borderRadius: 22,
                  shadowColor: '#FF4757',
                  shadowOpacity: 0.4,
                  shadowRadius: 10
                }]}
                onPress={performSignOut}
              >
                <Text style={[styles.accessCloseBtnText, { fontSize: 16 }]}>SIGN OUT</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={{
                  width: '100%',
                  paddingVertical: 15,
                  alignItems: 'center',
                  marginTop: 5
                }}
                onPress={() => setIsSignOutModalVisible(false)}
              >
                <Text style={{ color: '#A4B0BE', fontWeight: '800', letterSpacing: 1.5, fontSize: 13 }}>CANCEL</Text>
              </TouchableOpacity>
            </View>
          </LinearGradient>
        </View>
      </Modal>

      {/* Create Password Modal for Legacy Users */}
      <Modal visible={isCreatePasswordModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <LinearGradient
            colors={['#FFFFFF', '#F0F7FF']}
            style={styles.accessModalContent}
          >
            <View style={[styles.lockIconCircle, { backgroundColor: '#E3F2FD', borderColor: '#BBDEFB' }]}>
              <MaterialCommunityIcons name="shield-key" size={50} color="#1976D2" />
            </View>
            <Text style={styles.accessModalTitle}>Secure Your Account</Text>
            <Text style={styles.accessModalText}>
              We've updated our security. Please create a password for your account to enable cross-device sync.
            </Text>

            <TextInput
              style={[styles.input, passError ? styles.inputError : null]}
              placeholder="Enter New Password"
              placeholderTextColor="#A4B0BE"
              value={tempPassword}
              onChangeText={(text) => {
                setTempPassword(text);
                if (passError) setPassError('');
              }}
              secureTextEntry
              autoFocus
            />

            {passError ? (
              <View style={[styles.errorContainer, { marginBottom: 15 }]}>
                <MaterialCommunityIcons name="alert-circle" size={16} color="#FF4757" />
                <Text style={styles.errorText}>{passError}</Text>
              </View>
            ) : null}

            <TouchableOpacity
              style={[styles.successCloseBtn, { backgroundColor: '#1976D2' }, isCheckingName && { opacity: 0.7 }]}
              onPress={handleCreatePassword}
              disabled={isCheckingName}
            >
              {isCheckingName ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.successCloseBtnText}>CREATE PASSWORD</Text>
              )}
            </TouchableOpacity>
          </LinearGradient>
        </View>
      </Modal>

      {/* Username Input / Login Modal */}
      <Modal visible={isUserModalVisible} transparent={false} animationType="slide">
        <SafeAreaView style={[styles.container, { justifyContent: 'center', padding: 30 }]}>
          <View style={styles.userModalContent}>
            <Text style={[styles.modalTitle, { textAlign: 'center', fontSize: 28 }]}>
              {isLoginMode ? 'Welcome Back!' : 'Welcome!'}
            </Text>
            <Text style={[styles.modalStatus, { marginBottom: 30 }]}>
              {isLoginMode
                ? 'Please enter your credentials to login to your account.'
                : 'Please enter your first name to personalize your experience. This cannot be changed later.'}
            </Text>
            <TextInput
              style={[styles.input, nameError ? styles.inputError : null]}
              placeholder="Your Name (One Word)"
              placeholderTextColor="#A4B0BE"
              value={tempName}
              onChangeText={(text) => {
                setTempName(text);
                if (nameError) setNameError('');
              }}
              autoFocus
              autoCorrect={false}
              autoCapitalize="none"
              maxLength={15}
            />
            <TextInput
              style={[styles.input, passError ? styles.inputError : null]}
              placeholder={isLoginMode ? "Your Password" : "Create Password (Min 5 chars)"}
              placeholderTextColor="#A4B0BE"
              value={tempPassword}
              onChangeText={(text) => {
                setTempPassword(text);
                if (passError) setPassError('');
              }}
              secureTextEntry
              autoCorrect={false}
              maxLength={20}
            />
            {nameError || passError ? (
              <View style={styles.errorContainer}>
                <MaterialCommunityIcons name="alert-circle" size={16} color="#FF4757" />
                <Text style={styles.errorText}>{nameError || passError}</Text>
              </View>
            ) : null}
            <TouchableOpacity
              style={[styles.saveBtn, isCheckingName && { opacity: 0.7 }]}
              onPress={isLoginMode ? handleLogin : handleSaveName}
              disabled={isCheckingName}
            >
              {isCheckingName ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.saveBtnText}>{isLoginMode ? 'LOGIN' : 'GET STARTED'}</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={{ marginTop: 25, alignItems: 'center' }}
              onPress={() => {
                setIsLoginMode(!isLoginMode);
                setNameError('');
                setPassError('');
              }}
            >
              <Text style={{ color: '#4A90E2', fontWeight: '800' }}>
                {isLoginMode ? "Don't have an account? Register" : "Already have an account? Login"}
              </Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F0F3F7' },
  scroll: { flexGrow: 1, paddingBottom: 40 },
  header: {
    paddingHorizontal: 25,
    paddingTop: 15,
    paddingBottom: 20,
    backgroundColor: '#FFF',
    borderBottomRightRadius: 40,
    borderBottomLeftRadius: 40,
    elevation: 8,
    shadowColor: '#4A90E2',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  appTitle: { fontSize: 32, fontWeight: '900', color: '#1A1A1A', letterSpacing: -1 },
  appSub: { fontSize: 17, color: '#18078F', marginTop: 20, fontWeight: '800', letterSpacing: 1 },
  syncButton: {
    width: 40,
    height: 40,
    borderRadius: 15,
    backgroundColor: '#FFF',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
    shadowColor: '#636E72',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    borderWidth: 1,
    borderColor: '#F1F2F6'
  },
  syncButtonActive: { shadowColor: '#2ECC71', backgroundColor: '#E8F5E9', borderColor: '#C8E6C9' },
  squareGrid: {
    padding: 20,
    paddingTop: 30,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  squareCard: {
    width: '47%',
    aspectRatio: 1,
    backgroundColor: '#FFF',
    borderRadius: 35,
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 12,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 15,
    marginBottom: 20
  },
  squareIconBox: {
    width: 65,
    height: 65,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 15
  },
  squareTitle: { fontSize: 14, fontWeight: '900', color: '#2D3436', textAlign: 'center', letterSpacing: 0.8 },
  squareDesc: { fontSize: 10, color: '#A4B0BE', textAlign: 'center', marginTop: 4, fontWeight: '800', letterSpacing: 0.5 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(45, 52, 54, 0.4)', justifyContent: 'center', alignItems: 'center', padding: 30 },
  modalContent: { backgroundColor: '#FFF', width: '100%', padding: 35, borderRadius: 40, alignItems: 'center', elevation: 20 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#2D3436', marginBottom: 8, letterSpacing: 1 },
  modalStatus: { fontSize: 14, color: '#636E72', marginBottom: 25, textAlign: 'center', fontWeight: '600', lineHeight: 20 },
  progressContainer: { width: '100%', height: 12, backgroundColor: '#F1F2F6', borderRadius: 6, overflow: 'hidden', marginBottom: 10 },
  progressBar: { height: '100%', backgroundColor: '#2ECC71', borderRadius: 6 },
  progressPercent: { fontSize: 16, fontWeight: '900', color: '#2ECC71', marginBottom: 5 },
  closeBtn: { marginTop: 20, paddingVertical: 16, paddingHorizontal: 40, backgroundColor: '#2D3436', borderRadius: 20 },
  closeBtnText: { color: '#FFF', fontWeight: '900', fontSize: 14, letterSpacing: 1 },
  userModalContent: { backgroundColor: '#FFF', width: '100%', padding: 35, borderRadius: 40, elevation: 20 },
  input: { width: '100%', backgroundColor: '#F1F2F6', padding: 20, borderRadius: 20, fontSize: 16, fontWeight: '700', color: '#2D3436', marginBottom: 15, borderWidth: 1, borderColor: '#E0E0E0' },
  inputError: { borderColor: '#FF4757', backgroundColor: '#FFF5F5' },
  errorContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: 20, marginLeft: 5 },
  errorText: { color: '#FF4757', fontSize: 13, fontWeight: '700', marginLeft: 5 },
  saveBtn: { width: '100%', paddingVertical: 18, backgroundColor: '#4A90E2', borderRadius: 20, alignItems: 'center', elevation: 4 },
  saveBtnText: { color: '#FFF', fontWeight: '900', fontSize: 16, letterSpacing: 1 },

  // Access Denied Modal Styles
  accessModalContent: {
    width: '85%',
    padding: 30,
    borderRadius: 35,
    alignItems: 'center',
    elevation: 25,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 15 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
  },
  lockIconCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: '#FFF1F2',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 2,
    borderColor: '#FFE4E6',
  },
  accessModalTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#2D3436',
    marginBottom: 12,
    textAlign: 'center',
  },
  accessModalText: {
    fontSize: 15,
    color: '#636E72',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 25,
    fontWeight: '600',
  },
  accessCloseBtn: {
    width: '100%',
    paddingVertical: 16,
    backgroundColor: '#2D3436',
    borderRadius: 18,
    alignItems: 'center',
    shadowColor: '#2D3436',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  accessCloseBtnText: {
    color: '#FFF',
    fontWeight: '900',
    fontSize: 14,
    letterSpacing: 2,
  },

  // Success Modal Styles
  successModalContent: {
    width: '85%',
    padding: 30,
    borderRadius: 35,
    alignItems: 'center',
    elevation: 25,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 15 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
  },
  successIconCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: '#E8F5E9',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 2,
    borderColor: '#C8E6C9',
  },
  successModalTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#2D3436',
    marginBottom: 12,
    textAlign: 'center',
  },
  successModalText: {
    fontSize: 15,
    color: '#636E72',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 25,
    fontWeight: '600',
  },
  successCloseBtn: {
    width: '100%',
    paddingVertical: 16,
    backgroundColor: '#2ECC71',
    borderRadius: 18,
    alignItems: 'center',
    shadowColor: '#2ECC71',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  successCloseBtnText: {
    color: '#FFF',
    fontWeight: '900',
    fontSize: 14,
    letterSpacing: 2,
  },

  // Error Modal Styles
  errorModalContent: {
    width: '85%',
    padding: 30,
    borderRadius: 35,
    alignItems: 'center',
    elevation: 25,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 15 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
  },
  errorIconCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: '#FFF1F2',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 2,
    borderColor: '#FFE4E6',
  },
  errorModalTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#2D3436',
    marginBottom: 12,
    textAlign: 'center',
  },
  errorModalText: {
    fontSize: 15,
    color: '#636E72',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 25,
    fontWeight: '600',
  },
  errorCloseBtn: {
    width: '100%',
    paddingVertical: 16,
    backgroundColor: '#FF4757',
    borderRadius: 18,
    alignItems: 'center',
    shadowColor: '#FF4757',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  errorCloseBtnText: {
    color: '#FFF',
    fontWeight: '900',
    fontSize: 14,
    letterSpacing: 2,
  },
  floatingSyncBtn: {
    position: 'absolute',
    bottom: 60,
    right: 30,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#FFF',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 10,
    shadowColor: '#4A90E2',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    borderWidth: 2,
    borderColor: '#F1F2F6',
    zIndex: 999
  },
  updateDot: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#2ECC71',
    borderWidth: 2,
    borderColor: '#FFF'
  }
});
