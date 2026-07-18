package com.taskbridge.app.testing

import java.io.File

fun androidSource(relativePath: String): String {
    val start = File(checkNotNull(System.getProperty("user.dir"))).absoluteFile
    val file = generateSequence(start) { it.parentFile }
        .flatMap { directory ->
            sequenceOf(
                File(directory, relativePath),
                File(directory, "app/$relativePath"),
                File(directory, "android/app/$relativePath"),
            )
        }
        .firstOrNull(File::isFile)
        ?: error("Unable to locate $relativePath from $start")
    return file.readText(Charsets.UTF_8)
}
