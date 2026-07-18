package com.taskbridge.app

import com.taskbridge.app.testing.androidSource
import org.junit.Assert.assertTrue
import org.junit.Test

class AndroidReadmeContractTest {
    @Test
    fun releaseDocsDistinguishCiPublishingFromLocalUnsignedAssembly() {
        val readme = androidSource("README.md")

        assertTrue(readme.contains("未配置完整 Android 签名时，Release workflow 只运行测试"))
        assertTrue(readme.contains("不会上传 unsigned APK"))
        assertTrue(readme.contains("本地 `assembleRelease` 仍允许生成 unsigned APK 用于开发验证"))
    }
}
