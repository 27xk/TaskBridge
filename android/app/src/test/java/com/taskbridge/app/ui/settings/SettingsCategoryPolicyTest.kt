package com.taskbridge.app.ui.settings

import org.junit.Assert.assertEquals
import org.junit.Test

class SettingsCategoryPolicyTest {
    @Test
    fun settingsCategoriesKeepTheirStableEnglishOrder() {
        assertEquals(
            listOf("Preferences", "Connection", "Account", "Data and backups", "Sync issues"),
            settingsCategoryLabels(isEnglish = true),
        )
    }

    @Test
    fun settingsCategoriesKeepTheirStableChineseOrder() {
        assertEquals(
            listOf("偏好", "连接", "账号", "数据与备份", "同步问题"),
            settingsCategoryLabels(isEnglish = false),
        )
    }
}
