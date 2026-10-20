package com.taskbridge.app.ui.settings

import com.taskbridge.app.testing.androidSource
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SettingsCategoryNavigationContractTest {
    @Test
    fun settingsUsesOneScannableCategoryDropdownInsteadOfAButtonWall() {
        val source = androidSource("src/main/java/com/taskbridge/app/ui/settings/SettingsScreen.kt")
        val categoryNavigation = source
            .substringAfter("TaskHomeHeader(")
            .substringBefore("if (selectedSection == SettingsSection.Preferences)")

        assertTrue(categoryNavigation.contains("AppDropdownField("))
        assertTrue(categoryNavigation.contains("settingsSectionOptions(isEnglish)"))
        assertFalse(categoryNavigation.contains("FlowRow("))
        assertFalse(categoryNavigation.contains("settingsSectionStatusText("))
        assertFalse(source.contains("private fun SettingsSectionButton("))
    }

    @Test
    fun settingsCategoryDropdownPreservesAllFiveDestinations() {
        val source = androidSource("src/main/java/com/taskbridge/app/ui/settings/SettingsScreen.kt")

        assertTrue(source.contains("SettingsSection.Preferences to"))
        assertTrue(source.contains("SettingsSection.Connection to"))
        assertTrue(source.contains("SettingsSection.Account to"))
        assertTrue(source.contains("SettingsSection.Data to"))
        assertTrue(source.contains("SettingsSection.Troubleshooting to"))
    }
}
