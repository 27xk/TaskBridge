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
    }
}
