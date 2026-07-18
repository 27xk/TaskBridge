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
        assertEquals("Change server address", strings.changeServerAddress)
        assertEquals("Current filters", strings.currentFilters)
        assertEquals("Restore selected", strings.restoreSelected)
        assertEquals("Delete selected permanently", strings.deleteSelectedPermanently)
        assertEquals(
            "Usually not needed; open only for custom proxies or connection troubleshooting.",
            strings.advancedConnectionSecondaryHint,
        )
        assertEquals("Troubleshooting: custom connection URLs", strings.advancedConnectionSettings)
        assertEquals("Request address for custom proxy", strings.requestUrlAdvanced)
        assertEquals("Sync address for custom proxy", strings.syncConnectionUrlAdvanced)
        assertEquals("Example: write weekly report", strings.quickAddPlaceholder)
        assertEquals(
            "Title is enough. You can also add time, tags, or priority in the title.",
            strings.autoFillHint,
        )
        assertEquals("More: tags, repeat, templates", strings.moreSettings)
        assertEquals("Hide more", strings.hideSettings)
    }
}
