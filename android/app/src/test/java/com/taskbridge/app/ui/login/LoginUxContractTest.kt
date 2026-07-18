package com.taskbridge.app.ui.login

import java.io.File
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class LoginUxContractTest {
    @Test
    fun loginStartupDoesNotProbeRegistrationStatus() {
        val source = sourceFile("ui/login/LoginViewModel.kt")
        val initBlock = source.blockStartingAt("    init {")

        assertFalse(initBlock.contains("authRepository.registrationEnabled()"))
    }

    @Test
    fun loginDoesNotRunAConnectionProbeBeforeSubmittingCredentials() {
        val source = sourceFile("ui/login/LoginViewModel.kt")
        val loginBlock = source.blockStartingAt("    fun login(")

        assertFalse(loginBlock.contains("ensureConnectionReadyForAuth()"))
        assertTrue(loginBlock.contains("authRepository.login("))
    }

    @Test
    fun accountFormAppearsBeforeConnectionTroubleshooting() {
        val source = sourceFile("ui/login/LoginScreen.kt")

        assertTrue(source.indexOf("            SignInPanel(") < source.indexOf("strings.connectionSettings"))
    }

    @Test
    fun registrationUnknownAfterSubmitUsesAfterCheckExplanation() {
        val source = sourceFile("ui/login/RegisterScreen.kt")
        val localizer = source.blockStartingAt("private fun localizeRegisterError(")

        assertTrue(
            localizer.contains(
                "registrationStatusUnknownMessageKey -> registrationStatusUnknownAfterCheckHelp(isEnglish)",
            ),
        )
    }

    private fun sourceFile(relativePath: String): String {
        val suffix = "src/main/java/com/taskbridge/app/$relativePath"
        val start = File(checkNotNull(System.getProperty("user.dir"))).absoluteFile
        val file = generateSequence(start) { it.parentFile }
            .flatMap { directory ->
                sequenceOf(
                    File(directory, suffix),
                    File(directory, "app/$suffix"),
                    File(directory, "android/app/$suffix"),
                )
            }
            .firstOrNull(File::isFile)
            ?: error("Unable to locate $suffix from $start")
        return file.readText(Charsets.UTF_8)
    }

    private fun String.blockStartingAt(marker: String): String {
        val start = indexOf(marker)
        require(start >= 0) { "Missing source marker: $marker" }
        var depth = 0
        var foundOpeningBrace = false
        for (index in start until length) {
            when (this[index]) {
                '{' -> {
                    depth += 1
                    foundOpeningBrace = true
                }
                '}' -> if (foundOpeningBrace) {
                    depth -= 1
                    if (depth == 0) return substring(start, index + 1)
                }
            }
        }
        error("Unterminated block for marker: $marker")
    }
}
