import * as DocumentPicker from "expo-document-picker"
import * as FileSystem from "expo-file-system"
import * as Sharing from "expo-sharing"
import localStorageService from "./localStorageService"
import authService from "./authService"
import AsyncStorage from "@react-native-async-storage/async-storage"

class DataPortabilityService {
  async getDataSummary(userId) {
    try {
      const snapshot = await this._buildStorageSnapshot()
      const dailyJournals = snapshot.storage?.daily_journals || {}
      const legacyJournals = snapshot.storage?.journal_entries || []
      const wellnessData = snapshot.storage?.wellness_data || {}
      const closeContacts = snapshot.storage?.closeContacts || []

      const journalEntriesCount = Object.keys(dailyJournals).length + (legacyJournals?.length || 0)
      const wellnessCount = Object.keys(wellnessData).length
      const closeContactsCount = Array.isArray(closeContacts) ? closeContacts.length : 0
      const totalStorageUsed = Math.round((snapshot.totalBytes || 0) / 1024)

      return {
        journalEntries: journalEntriesCount,
        wellnessDataPoints: wellnessCount,
        closeContacts: closeContactsCount,
        totalStorageUsed,
      }
    } catch (error) {
      console.error("Error getting data summary:", error)
      return {
        journalEntries: 0,
        wellnessDataPoints: 0,
        closeContacts: 0,
        totalStorageUsed: 0,
      }
    }
  }

  async exportAllData(userId) {
    try {
      await localStorageService.initialize()
      const user = authService.getCurrentUser()
      const snapshot = await this._buildStorageSnapshot()
      const summary = await this.getDataSummary(userId)

      // Create export object
      const exportData = {
        exportInfo: {
          userId: userId,
          userEmail: user?.email,
          exportDate: new Date().toISOString(),
          version: "2.0",
          appVersion: "1.0.0",
          format: "full-local-export-v1",
          notes: "SecureStore contents (including the device encryption key) are not exported.",
        },
        summary,
        storage: snapshot.storage,
        storageMeta: snapshot.meta,
      }

      // Create filename with timestamp
      const timestamp = new Date().toISOString().split("T")[0]
      const fileName = `equilibrium_export_${timestamp}.json`
      const filePath = `${FileSystem.documentDirectory}${fileName}`

      // Write to file
      await FileSystem.writeAsStringAsync(filePath, JSON.stringify(exportData, null, 2), {
        encoding: FileSystem.EncodingType.UTF8,
      })

      // Share the file
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(filePath, {
          mimeType: "application/json",
          dialogTitle: "Export Equilibrium Data",
        })
      }

      return {
        success: true,
        fileName,
        filePath,
        recordCount: summary,
      }
    } catch (error) {
      console.error("Export error:", error)
      return {
        success: false,
        error: error.message,
      }
    }
  }

  async importData() {
    try {
      await localStorageService.initialize()
      // Pick file
      const result = await DocumentPicker.getDocumentAsync({
        type: "application/json",
        copyToCacheDirectory: true,
      })

      if (result.canceled) {
        return { success: false, cancelled: true }
      }

      // Read file content
      const fileContent = await FileSystem.readAsStringAsync(result.assets[0].uri)
      const importData = JSON.parse(fileContent)

      // Validate import data structure
      if (!importData.exportInfo || !importData.exportInfo.version) {
        throw new Error("Invalid export file format")
      }

      let importedCount = 0

      if (importData.storage && importData.storageMeta) {
        importedCount = await this._restoreStorageSnapshot(importData.storage, importData.storageMeta)
        return {
          success: true,
          message: `Successfully imported ${importedCount} records from ${importData.exportInfo.exportDate}`,
          importedCount,
        }
      }

      // Import journal entries
      if (importData.journalEntries && Array.isArray(importData.journalEntries)) {
        for (const entry of importData.journalEntries) {
          await localStorageService.saveJournalEntry({
            content: entry.content,
            mood_score: entry.moodScore,
            sentiment_label: entry.sentimentLabel,
            timestamp: entry.timestamp,
          })
          importedCount++
        }
      }

      // Import wellness data
      if (importData.wellnessData && Array.isArray(importData.wellnessData)) {
        for (const data of importData.wellnessData) {
          await localStorageService.saveWellnessData(data.date, {
            sleepHours: data.sleepHours,
            moodScore: data.moodScore,
            screenTimeMinutes: data.screenTimeMinutes,
            activityMinutes: data.activityMinutes,
            wellnessScore: data.wellnessScore,
          })
          importedCount++
        }
      }

      // Import close contacts
      if (importData.closeContacts && Array.isArray(importData.closeContacts)) {
        for (const contact of importData.closeContacts) {
          const existingContacts = await AsyncStorage.getItem("closeContacts")
          const parsed = existingContacts ? JSON.parse(existingContacts) : []
          parsed.push({
            id: contact.id,
            name: contact.name,
            phone: contact.phone,
            relationship: contact.relationship,
            is_emergency: contact.isEmergency,
          })
          await AsyncStorage.setItem("closeContacts", JSON.stringify(parsed))
          importedCount++
        }
      }

      return {
        success: true,
        message: `Successfully imported ${importedCount} records from ${importData.exportInfo.exportDate}`,
        importedCount,
      }
    } catch (error) {
      console.error("Import error:", error)
      return {
        success: false,
        error: error.message,
      }
    }
  }

  async deleteAllLocalData(userId) {
    try {
      await localStorageService.clearAllData()
      return true
    } catch (error) {
      console.error("Error deleting local data:", error)
      return false
    }
  }

  async deleteAllData(userId, password) {
    try {
      // Verify password with backend
      const user = authService.getCurrentUser()
      const deleteResult = await authService.deleteAccount(password)

      if (deleteResult.success) {
        // Clear all local data
        await localStorageService.clearAllData()

        // Clear other app data
        await this.clearAllAppData(userId)

        return { success: true }
      } else {
        return { success: false, error: deleteResult.error }
      }
    } catch (error) {
      console.error("Error deleting all data:", error)
      return { success: false, error: error.message }
    }
  }

  async clearAllAppData(userId) {
    try {
      // Clear all AsyncStorage data related to the user
      const keys = await AsyncStorage.getAllKeys()
      const userKeys = keys.filter((key) => key.includes(userId) || key.includes("equilibrium"))

      if (userKeys.length > 0) {
        await AsyncStorage.multiRemove(userKeys)
      }

      return true
    } catch (error) {
      console.error("Error clearing app data:", error)
      return false
    }
  }

  async _buildStorageSnapshot() {
    await localStorageService.initialize()
    const keys = await AsyncStorage.getAllKeys()
    const items = await AsyncStorage.multiGet(keys)

    const storage = {}
    const meta = {}
    let totalBytes = 0

    items.forEach(([key, raw]) => {
      if (raw === null || raw === undefined) return
      totalBytes += raw.length

      let decrypted = null
      try {
        decrypted = localStorageService.decrypt(raw)
      } catch (error) {
        decrypted = null
      }

      if (decrypted !== null && decrypted !== undefined) {
        storage[key] = decrypted
        meta[key] = { wasEncrypted: true, encoding: "decrypted" }
        return
      }

      try {
        const parsed = JSON.parse(raw)
        storage[key] = parsed
        meta[key] = { wasEncrypted: false, encoding: "json" }
        return
      } catch (error) {
        storage[key] = raw
        meta[key] = { wasEncrypted: false, encoding: "raw" }
      }
    })

    return { storage, meta, keyCount: keys.length, totalBytes }
  }

  async _restoreStorageSnapshot(storage, meta) {
    if (!storage) return 0

    let imported = 0
    const entries = Object.entries(storage)

    for (const [key, value] of entries) {
      const info = meta?.[key] || {}
      if (info.encoding === "raw") {
        await AsyncStorage.setItem(key, typeof value === "string" ? value : JSON.stringify(value))
      } else if (info.wasEncrypted) {
        await localStorageService.setItem(key, value, true)
      } else {
        await localStorageService.setItem(key, value, false)
      }
      imported++
    }

    return imported
  }
}

export default new DataPortabilityService()
