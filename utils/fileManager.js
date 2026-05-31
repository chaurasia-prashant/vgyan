import { documentDirectory } from 'expo-file-system/legacy';
import { Platform, Alert } from 'react-native';

export const getSafeRootDir = () => {
  // Use the system-provided documentDirectory
  // This is the absolute path to the app's internal files folder
  let base = documentDirectory;

  if (!base) {
    return "";
  }

  // Ensure path starts with file:// and ends with a slash
  let path = base.endsWith('/') ? base : `${base}/`;

  // Return the absolute path for our folder
  return `${path}ExamList/`;
};

export const sanitizeName = (name) => {
  if (!name) return "General";
  return name.trim().replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_');
};

export const globalError = (title, message) => {
  Alert.alert(title || "App Error", message || "An unexpected error occurred.");
};
