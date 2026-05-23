package com.taskbridge.app.ui.components

import com.taskbridge.app.ui.i18n.AppLanguage
import com.taskbridge.app.ui.i18n.stringsFor
import org.junit.Assert.assertEquals
import org.junit.Test

class AppUiOptionsTest {
    @Test
    fun languageOptionsUseLocalizedLabels() {
        val zh = stringsFor(AppLanguage.Chinese)
        val en = stringsFor(AppLanguage.English)

        assertEquals(listOf(zh.chinese, zh.english), languageOptions(zh).map { it.label })
        assertEquals(listOf(en.chinese, en.english), languageOptions(en).map { it.label })
    }

    @Test
    fun repeatRuleOptionsExposeStableValues() {
        val labels = repeatRuleOptions()

        assertEquals("", labels[0].value)
        assertEquals("daily", labels[1].value)
        assertEquals("weekly", labels[2].value)
        assertEquals("monthly", labels[3].value)
    }
}
