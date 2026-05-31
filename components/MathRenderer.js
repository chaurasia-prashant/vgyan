import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, Image, ActivityIndicator, Text } from 'react-native';
import { WebView } from 'react-native-webview';
import * as FileSystem from 'expo-file-system/legacy';
import { MaterialCommunityIcons } from '@expo/vector-icons';

/**
 * High-Fidelity MathRenderer using MathJax 3.
 * Renders LaTeX content and optional question images.
 * Asymptote/Skia plotting removed as per request.
 */
export default function MathRenderer({ htmlContent, questionImage, fontSize = 16, isQuestion = false, githubToken = null }) {
  const [webViewHeight, setWebViewHeight] = useState(0);
  const [isLoaded, setIsLoaded] = useState(false);
  const [localImageUri, setLocalImageUri] = useState(null);
  const [imageError, setImageError] = useState(false);
  const webViewRef = useRef(null);

  useEffect(() => {
    let isMounted = true;

    const prepareImage = async () => {
      if (!questionImage) {
        setLocalImageUri(null);
        setImageError(false);
        return;
      }

      setImageError(false);
      // If it's a GitHub API URL and we have a token, download it securely
      if (questionImage.includes('api.github.com') && githubToken) {
        try {
          const filename = questionImage.split('/').pop();
          const localPath = `${FileSystem.cacheDirectory}${filename}`;

          // Check if already cached
          const fileInfo = await FileSystem.getInfoAsync(localPath);
          if (fileInfo.exists) {
            if (isMounted) setLocalImageUri(localPath);
            return;
          }

          const result = await FileSystem.downloadAsync(
            questionImage,
            localPath,
            {
              headers: {
                'Authorization': `token ${githubToken}`,
                'Accept': 'application/vnd.github.v3.raw'
              }
            }
          );

          if (isMounted) setLocalImageUri(result.uri);
        } catch (e) {
          if (isMounted) {
            setImageError(true);
            setLocalImageUri(null);
          }
        }
      } else {
        if (isMounted) setLocalImageUri(questionImage);
      }
    };

    prepareImage();
    return () => { isMounted = false; };
  }, [questionImage, githubToken]);

  if (!htmlContent && !questionImage) return null;

  // Process content: standard text/math only
  const processedContent = (htmlContent || "")
    .replace(/\\begin\{tabular\}/g, '\\begin{array}')
    .replace(/\\end\{tabular\}/g, '\\end{array}')
    .replace(/\\bold/g, '\\mathbf')
    .replace(/\n/g, '<br/>');

  const injectedJS = `
    (function() {
      const wrapper = document.getElementById('math-wrapper');

      const sendHeight = () => {
        const height = wrapper.getBoundingClientRect().height;
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'height', value: height }));
      };

      if (window.MathJax && window.MathJax.startup) {
        window.MathJax.startup.promise.then(() => {
          sendHeight();
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ready' }));
          const ro = new ResizeObserver(() => setTimeout(sendHeight, 100));
          ro.observe(wrapper);
        });
      } else {
        sendHeight();
      }

      [1000, 3000].forEach(d => setTimeout(sendHeight, d));
    })();
    true;
  `;

  const onMessage = (event) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'height') {
        const h = parseFloat(data.value);
        if (h > 0 && Math.abs(h - webViewHeight) > 1) {
          setWebViewHeight(h + 15);
        }
      } else if (data.type === 'ready') {
        setIsLoaded(true);
      }
    } catch (e) {
      // Fallback for simple numeric messages
      const h = parseFloat(event.nativeEvent.data);
      if (!isNaN(h)) setWebViewHeight(h + 15);
    }
  };

  return (
    <View style={styles.outerContainer}>
      {!isLoaded && (
        <View style={styles.globalLoader}>
          <ActivityIndicator size="small" color="#2196F3" />
          <Text style={styles.loaderText}>Preparing content...</Text>
        </View>
      )}

      <View style={{ height: webViewHeight || 60, width: '100%', opacity: isLoaded ? 1 : 0 }}>
        <WebView
          ref={webViewRef}
          originWhitelist={['*']}
          source={{ html: generateMathJaxHtml(processedContent, fontSize) }}
          style={styles.webview}
          scrollEnabled={false}
          onMessage={onMessage}
          injectedJavaScript={injectedJS}
          javaScriptEnabled={true}
          transparent={true}
        />
      </View>

      {!!questionImage && isLoaded && (
        <View style={styles.imageWrapper}>
          {imageError ? (
            <View style={styles.errorContainer}>
              <MaterialCommunityIcons name="image-off-outline" size={24} color="#FF7675" />
              <Text style={styles.errorText}>Unable to load question image.</Text>
              <Text style={styles.errorSubText}>Please check your internet connection.</Text>
            </View>
          ) : localImageUri ? (
            <Image
              key={`${localImageUri}-${githubToken}`}
              source={{ uri: localImageUri }}
              style={styles.questionImg}
              resizeMode="contain"
              onError={() => setImageError(true)}
            />
          ) : (
            <ActivityIndicator size="small" color="#4A90E2" />
          )}
        </View>
      )}
    </View>
  );
}

const generateMathJaxHtml = (content, size) => `
  <!DOCTYPE html>
  <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
      <script>
        window.MathJax = {
          tex: {
            inlineMath: [['$', '$'], ['\\\\(', '\\\\)']],
            displayMath: [['$$', '$$'], ['\\\\[', '\\\\]']],
            processEscapes: true,
            processEnvironments: true,
            packages: {'[+]': ['ams', 'mhchem']}
          },
          options: { enableMenu: false },
          loader: { load: ['[tex]/mhchem', '[tex]/ams'] }
        };
      </script>
      <script id="MathJax-script" async src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-chtml.js"></script>
      <style>
        body { 
          font-family: -apple-system, system-ui, sans-serif;
          font-size: ${size}px; 
          color: #2D3436; 
          margin: 0; padding: 0;
          background-color: transparent;
          line-height: 1.6;
        }
        #math-wrapper { display: block; padding: 5px 0; }
        mjx-container[display="true"] { overflow-x: auto; padding: 10px 0; }
      </style>
    </head>
    <body>
      <div id="math-wrapper">${content}</div>
    </body>
  </html>
`;

const styles = StyleSheet.create({
  outerContainer: { width: '100%', marginVertical: 2 },
  webview: { backgroundColor: 'transparent' },
  globalLoader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    backgroundColor: '#F8F9FA',
    borderRadius: 10,
    marginBottom: 5
  },
  loaderText: {
    marginLeft: 10,
    fontSize: 14,
    color: '#636E72',
    fontWeight: '500'
  },
  imageWrapper: {
    marginTop: 10,
    padding: 15,
    alignItems: 'center',
    backgroundColor: '#FAFAFA',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#F0F0F0'
  },
  questionImg: { width: '100%', height: 220 },
  errorContainer: {
    alignItems: 'center',
    padding: 10
  },
  errorText: {
    color: '#FF7675',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 8,
    textAlign: 'center'
  },
  errorSubText: {
    color: '#A4B0BE',
    fontSize: 11,
    marginTop: 2,
    textAlign: 'center'
  }
});
