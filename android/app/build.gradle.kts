import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.ksp)
}

android {
    namespace = "com.taskbridge.app"
    compileSdk = 35

    val localProperties = Properties().apply {
        val localPropertiesFile = rootProject.file("local.properties")
        if (localPropertiesFile.isFile) {
            localPropertiesFile.inputStream().use(::load)
        }
    }
    fun taskBridgeProperty(name: String, defaultValue: String): String =
        providers.gradleProperty(name).orNull
            ?: localProperties.getProperty(name)
            ?: defaultValue

    val taskBridgeBaseUrl = taskBridgeProperty("TASKBRIDGE_BASE_URL", "http://192.168.10.30:8000/api/v1/")
    val taskBridgeWebSocketUrl = taskBridgeProperty("TASKBRIDGE_WS_URL", "ws://192.168.10.30:8000/ws/sync")
    val taskBridgeUsesCleartext =
        taskBridgeBaseUrl.startsWith("http://") || taskBridgeWebSocketUrl.startsWith("ws://")
    val releaseKeystorePath = taskBridgeProperty("ANDROID_KEYSTORE_PATH", System.getenv("ANDROID_KEYSTORE_PATH") ?: "")
    val releaseKeystorePassword = taskBridgeProperty("ANDROID_KEYSTORE_PASSWORD", System.getenv("ANDROID_KEYSTORE_PASSWORD") ?: "")
    val releaseKeyAlias = taskBridgeProperty("ANDROID_KEY_ALIAS", System.getenv("ANDROID_KEY_ALIAS") ?: "")
    val releaseKeyPassword = taskBridgeProperty("ANDROID_KEY_PASSWORD", System.getenv("ANDROID_KEY_PASSWORD") ?: "")
    val hasReleaseSigning = listOf(
        releaseKeystorePath,
        releaseKeystorePassword,
        releaseKeyAlias,
        releaseKeyPassword,
    ).all(String::isNotBlank)

    defaultConfig {
        applicationId = "com.taskbridge.app"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        buildConfigField("String", "TASKBRIDGE_BASE_URL", "\"$taskBridgeBaseUrl\"")
        buildConfigField("String", "TASKBRIDGE_WS_URL", "\"$taskBridgeWebSocketUrl\"")
        manifestPlaceholders["allowBackup"] = true
        manifestPlaceholders["usesCleartextTraffic"] = taskBridgeUsesCleartext
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        buildConfig = true
        compose = true
    }

    dependenciesInfo {
        includeInApk = false
        includeInBundle = false
    }

    packaging {
        resources {
            excludes += setOf(
                "META-INF/AL2.0",
                "META-INF/LGPL2.1",
                "META-INF/LICENSE*",
                "META-INF/NOTICE*",
            )
        }
    }

    signingConfigs {
        if (hasReleaseSigning) {
            create("release") {
                storeFile = file(releaseKeystorePath)
                storePassword = releaseKeystorePassword
                keyAlias = releaseKeyAlias
                keyPassword = releaseKeyPassword
            }
        }
    }

    buildTypes {
        debug {
            manifestPlaceholders["allowBackup"] = true
            manifestPlaceholders["usesCleartextTraffic"] = true
        }
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            signingConfig = if (hasReleaseSigning) {
                signingConfigs.getByName("release")
            } else {
                signingConfigs.getByName("debug")
            }
            manifestPlaceholders["allowBackup"] = false
            manifestPlaceholders["usesCleartextTraffic"] = taskBridgeUsesCleartext
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
        }
    }
}

dependencies {
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.datastore.preferences)
    implementation(libs.androidx.security.crypto)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.navigation.compose)
    implementation(libs.androidx.room.ktx)
    implementation(libs.androidx.room.runtime)
    implementation(libs.androidx.work.runtime.ktx)
    implementation(libs.gson)
    implementation(libs.retrofit.converter.gson)
    implementation(libs.retrofit)
    implementation(libs.kotlinx.coroutines.android)
    ksp(libs.androidx.room.compiler)

    debugImplementation(libs.androidx.compose.ui.tooling)
    testImplementation(libs.junit)
    androidTestImplementation(platform(libs.androidx.compose.bom))
    androidTestImplementation(libs.androidx.compose.ui.test.junit4)
    androidTestImplementation(libs.androidx.test.ext.junit)
}
