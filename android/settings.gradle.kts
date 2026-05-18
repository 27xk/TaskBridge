pluginManagement {
    val useChinaMirrors = providers.gradleProperty("TASKBRIDGE_USE_CHINA_MIRRORS")
        .map(String::toBoolean)
        .orElse(true)
        .get()

    repositories {
        maven(rootDir.resolve(".gradle/local-maven"))
        if (useChinaMirrors) {
            maven("https://maven.aliyun.com/repository/google")
            maven("https://maven.aliyun.com/repository/gradle-plugin")
            maven("https://maven.aliyun.com/repository/public")
        }
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    val useChinaMirrors = providers.gradleProperty("TASKBRIDGE_USE_CHINA_MIRRORS")
        .map(String::toBoolean)
        .orElse(true)
        .get()

    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        maven(rootDir.resolve(".gradle/local-maven"))
        if (useChinaMirrors) {
            maven("https://maven.aliyun.com/repository/google")
            maven("https://maven.aliyun.com/repository/central")
            maven("https://maven.aliyun.com/repository/public")
        }
        google()
        mavenCentral()
    }
}

rootProject.name = "TaskBridge"
include(":app")
