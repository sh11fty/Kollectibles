import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// ---- Versioning -------------------------------------------------------------------------
// CI passes the build time: FAHM_VERSION_CODE is minutes since 2025-01-01 and FAHM_VERSION_NAME is
// the date (e.g. 26.10.12.1530). Time only goes forward, so versionCode only ever goes up (Android
// requires that for an in-place update) - even if the project later moves to another repository.
val versionCodeEnv: Int = System.getenv("FAHM_VERSION_CODE")?.toIntOrNull() ?: 1
val versionNameEnv: String = System.getenv("FAHM_VERSION_NAME")?.takeIf { it.isNotBlank() } ?: "0.0.0-dev"
// GitHub repository ("owner/name") the app looks at for new releases. CI sets it to the repo it runs in.
val updateRepo: String = System.getenv("FAHM_REPO")?.takeIf { it.isNotBlank() } ?: "sh11fty/Kollectibles"

// ---- Signing ----------------------------------------------------------------------------
// Every build must be signed with the SAME key or Android refuses to update the installed app.
// Key material is read from environment variables (CI) or keystore/signing.properties (local).
val signingProps = Properties().apply {
    val f = rootProject.file("keystore/signing.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}
fun env(name: String): String? = System.getenv(name)?.takeIf { it.isNotBlank() }  // CI passes "" for a missing secret
val storePath: String? = env("FAHM_KEYSTORE_PATH")
    ?: signingProps.getProperty("storeFile")?.let { rootProject.file("keystore/$it").path }
val storePass: String? = env("FAHM_KEYSTORE_PASSWORD") ?: signingProps.getProperty("storePassword")
val keyAliasName: String? = env("FAHM_KEY_ALIAS") ?: signingProps.getProperty("keyAlias") ?: "fahm"
val keyPass: String? = env("FAHM_KEY_PASSWORD") ?: signingProps.getProperty("keyPassword") ?: storePass
val haveKey = storePath != null && file(storePath).exists() && storePass != null && keyAliasName != null && keyPass != null

android {
    namespace = "com.fahm.quran"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.fahm.quran"
        minSdk = 26
        targetSdk = 34
        versionCode = versionCodeEnv
        versionName = versionNameEnv
        buildConfigField("String", "UPDATE_REPO", "\"$updateRepo\"")
    }

    buildFeatures {
        buildConfig = true
    }

    signingConfigs {
        if (haveKey) {
            create("fahm") {
                storeFile = file(storePath!!)
                storePassword = storePass
                keyAlias = keyAliasName
                keyPassword = keyPass
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.findByName("fahm") ?: signingConfigs.getByName("debug")
        }
        debug {
            signingConfig = signingConfigs.findByName("fahm") ?: signingConfigs.getByName("debug")
        }
    }

    // The whole app UI lives in ../web and is packaged as assets.
    sourceSets["main"].assets.srcDir(file("../../web"))

    lint {
        // Release lint downloads extra analysis artifacts and adds a minute to every build; not needed here.
        checkReleaseBuilds = false
        abortOnError = false
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    androidResources {
        // Already-compressed formats are stored as-is; JSON/JS/CSS stay deflated to keep the APK small.
        noCompress += listOf("woff2", "mp3", "ogg", "png")
    }
    packaging {
        resources.excludes += setOf("META-INF/*.version", "DebugProbesKt.bin", "kotlin-tooling-metadata.json")
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.activity:activity-ktx:1.9.2")
    implementation("androidx.webkit:webkit:1.11.0")
}
