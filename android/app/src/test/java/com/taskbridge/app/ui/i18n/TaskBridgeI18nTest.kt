package com.taskbridge.app.ui.i18n

import org.junit.Assert.assertEquals
import org.junit.Test

class TaskBridgeI18nTest {
    @Test
    fun unknownLanguageDefaultsToChinese() {
        assertEquals(AppLanguage.Chinese, AppLanguage.fromCode(null))
        assertEquals(AppLanguage.Chinese, AppLanguage.fromCode("fr-FR"))
    }

    @Test
    fun englishLanguageReturnsEnglishStrings() {
        val strings = stringsFor(AppLanguage.English)

        assertEquals("Language", strings.language)
        assertEquals("Settings", strings.settings)
        assertEquals("Sign in", strings.signIn)
        assertEquals("Location", strings.list)
        assertEquals("Show password", strings.showPassword)
        assertEquals("Hide password", strings.hidePassword)
        assertEquals("Current filters", strings.currentFilters)
        assertEquals("Restore selected", strings.restoreSelected)
        assertEquals("Delete selected permanently", strings.deleteSelectedPermanently)
        assertEquals("More properties", strings.moreSettings)
        assertEquals("Hide properties", strings.hideSettings)
    }
}
