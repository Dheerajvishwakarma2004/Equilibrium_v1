// File: frontend/components/DevModePhase1Panel.js
// ============================================================
// DEV MODE - PHASE 1 TESTING PANEL
// Integrates into Dashboard dev mode for testing aggregation
// - Generate 30-day sample data
// - Run Phase 1 aggregation tests
// - Display results with pass/fail indicators
// ============================================================

import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import devsModeService from '../services/devsModeService';

const DevModePhase1Panel = () => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [generationResult, setGenerationResult] = useState(null);
  const [testResults, setTestResults] = useState(null);
  const [error, setError] = useState(null);

  const handleGenerateData = async () => {
    setIsGenerating(true);
    setError(null);
    try {
      const result = await devsModeService.generatePhase1TestData();
      if (result.success) {
        setGenerationResult(result);
      } else {
        setError(result.error || 'Failed to generate test data');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRunTests = async () => {
    if (!generationResult) {
      setError('Generate sample data first');
      return;
    }

    setIsTesting(true);
    setError(null);
    try {
      const results = await devsModeService.runPhase1Tests();
      setTestResults(results);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsTesting(false);
    }
  };

  const handleReset = () => {
    devsModeService.resetPhase1Tests();
    setGenerationResult(null);
    setTestResults(null);
    setError(null);
  };

  const renderTestStatus = (test) => {
    const icon = test.passed ? '✅' : '❌';
    return (
      <View key={test.name} style={styles.testResult}>
        <View style={styles.testHeader}>
          <Text style={styles.testIcon}>{icon}</Text>
          <Text style={styles.testName}>{test.name}</Text>
        </View>
        
        {test.metrics && (
          <View style={styles.metrics}>
            {Object.entries(test.metrics).map(([key, value]) => (
              <Text key={key} style={styles.metricLine}>
                • {key}: {value !== undefined ? String(value) : 'N/A'}
              </Text>
            ))}
          </View>
        )}

        {test.errors && test.errors.length > 0 && (
          <View style={styles.errors}>
            {test.errors.map((err, idx) => (
              <Text key={idx} style={styles.errorText}>
                ⚠️ {err}
              </Text>
            ))}
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>🧪 Phase 1 Testing</Text>

      {/* Generation Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Step 1: Generate Sample Data</Text>
        <TouchableOpacity
          style={[
            styles.button,
            isGenerating && styles.buttonDisabled,
            generationResult && styles.buttonSuccess,
          ]}
          onPress={handleGenerateData}
          disabled={isGenerating || isTesting}
        >
          {isGenerating ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.buttonText}>
              {generationResult ? '✅ Data Generated' : 'Generate 30-Day Data'}
            </Text>
          )}
        </TouchableOpacity>

        {generationResult && (
          <View style={styles.generationInfo}>
            <Text style={styles.infoText}>
              📊 Sleep Days: {generationResult.stats.sleepDays}/30 ({generationResult.stats.completeness.sleep}%)
            </Text>
            <Text style={styles.infoText}>
              📓 Journal Days: {generationResult.stats.journalDays}/30 ({generationResult.stats.completeness.journal}%)
            </Text>
            <Text style={styles.infoText}>
              🎯 Activity Days: {generationResult.stats.activityDays}/30 ({generationResult.stats.completeness.activity}%)
            </Text>
          </View>
        )}
      </View>

      {/* Testing Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Step 2: Run Tests</Text>
        <TouchableOpacity
          style={[
            styles.button,
            isTesting && styles.buttonDisabled,
            (!generationResult || isTesting) && styles.buttonDisabled,
          ]}
          onPress={handleRunTests}
          disabled={!generationResult || isTesting || isGenerating}
        >
          {isTesting ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.buttonText}>
              {testResults ? '✅ Tests Completed' : 'Run Phase 1 Tests'}
            </Text>
          )}
        </TouchableOpacity>

        {testResults && (
          <View style={styles.resultsContainer}>
            <View style={styles.summary}>
              <Text style={styles.summaryText}>
                Results: {testResults.summary.passed}/{testResults.summary.total} Passed
              </Text>
              <Text
                style={[
                  styles.summaryStatus,
                  testResults.summary.failed === 0
                    ? styles.summarySuccess
                    : styles.summaryWarning,
                ]}
              >
                {testResults.summary.failed === 0 ? '✅ ALL TESTS PASSED' : `⚠️ ${testResults.summary.failed} FAILED`}
              </Text>
            </View>

            <ScrollView style={styles.testsList} nestedScrollEnabled>
              {testResults.tests.map((test) => renderTestStatus(test))}
            </ScrollView>

            <Text style={styles.timestamp}>
              Tested: {new Date(testResults.timestamp).toLocaleString()}
            </Text>
          </View>
        )}
      </View>

      {/* Error Display */}
      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorTitle}>⚠️ Error</Text>
          <Text style={styles.errorMessage}>{error}</Text>
        </View>
      )}

      {/* Reset Button */}
      {(generationResult || testResults) && (
        <TouchableOpacity
          style={styles.resetButton}
          onPress={handleReset}
        >
          <Text style={styles.resetButtonText}>Reset Tests</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 12,
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    marginVertical: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 12,
    textAlign: 'center',
  },
  section: {
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
    paddingBottom: 12,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#aaa',
    marginBottom: 8,
  },
  button: {
    backgroundColor: '#007AFF',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 6,
    alignItems: 'center',
    marginBottom: 8,
  },
  buttonDisabled: {
    backgroundColor: '#444',
    opacity: 0.6,
  },
  buttonSuccess: {
    backgroundColor: '#34C759',
  },
  buttonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  generationInfo: {
    backgroundColor: '#2a2a2a',
    padding: 10,
    borderRadius: 6,
    marginTop: 8,
  },
  infoText: {
    color: '#bbb',
    fontSize: 11,
    marginVertical: 3,
    fontFamily: 'Courier',
  },
  resultsContainer: {
    backgroundColor: '#2a2a2a',
    borderRadius: 6,
    padding: 10,
    marginTop: 8,
  },
  summary: {
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#444',
    paddingBottom: 8,
  },
  summaryText: {
    color: '#aaa',
    fontSize: 11,
    marginBottom: 4,
  },
  summaryStatus: {
    fontSize: 12,
    fontWeight: 'bold',
    marginTop: 4,
  },
  summarySuccess: {
    color: '#34C759',
  },
  summaryWarning: {
    color: '#FF9500',
  },
  testsList: {
    maxHeight: 300,
    marginBottom: 8,
  },
  testResult: {
    marginBottom: 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#444',
  },
  testHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  testIcon: {
    fontSize: 14,
    marginRight: 6,
  },
  testName: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
  metrics: {
    marginLeft: 20,
    marginBottom: 6,
  },
  metricLine: {
    color: '#ccc',
    fontSize: 10,
    fontFamily: 'Courier',
    marginVertical: 2,
  },
  errors: {
    marginLeft: 20,
    marginTop: 6,
    backgroundColor: '#3a2a2a',
    padding: 6,
    borderRadius: 4,
  },
  errorText: {
    color: '#ff6b6b',
    fontSize: 10,
    fontFamily: 'Courier',
    marginVertical: 2,
  },
  timestamp: {
    color: '#666',
    fontSize: 9,
    textAlign: 'center',
    marginTop: 8,
    fontFamily: 'Courier',
  },
  errorContainer: {
    backgroundColor: '#3a2a2a',
    borderLeftWidth: 3,
    borderLeftColor: '#ff3b3b',
    padding: 10,
    borderRadius: 4,
    marginTop: 8,
  },
  errorTitle: {
    color: '#ff3b3b',
    fontWeight: 'bold',
    fontSize: 12,
    marginBottom: 4,
  },
  errorMessage: {
    color: '#ff9999',
    fontSize: 11,
    fontFamily: 'Courier',
  },
  resetButton: {
    backgroundColor: '#666',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    alignItems: 'center',
    marginTop: 12,
  },
  resetButtonText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
});

export default DevModePhase1Panel;
