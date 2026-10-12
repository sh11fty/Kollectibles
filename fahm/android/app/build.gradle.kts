import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// ---- Versioning -------------------------------------------------------------------------
// CI passes FAHM_BUILD_NUMBER (the workflow run number). versionCode only ever goes up, which
// Android requires for an in-place update. Local builds use build number 0.
val buildNumber = (System.getenv("FAHM_BUILD_NUMBER") ?: "0").toInt()

// ---- Signing ----------------------------------------------------------------------------
// Every build must be signed with the SAME key or Android refuses to update the installed app.
// Key material is read from environment variables (CI) or keystore/signing.properties (local).
val signingProps = Properties().apply {
    val f = rootProject.file("keystore/signing.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}
val storePath: String? = System.getenv("FAHM_KEYSTORE_PATH")
    ?: signingProps.getProperty("storeFile")?.let { rootProject.file("keystore/$it").path }
val storePass: String? = System.getenv("FAHM_KEYSTORE_PASSWORD") ?: signingProps.getProperty("storePassword")
val keyAliasName: String? = System.getenv("FAHM_KEY_ALIAS") ?: signingProps.getProperty("keyAlias")
val keyPass: String? = System.getenv("FAHM_KEY_PASSWORD") ?: signingProps.getProperty("keyPassword")
val haveKey = storePath != null && file(storePath).exists() && storePass != null && keyAliasName != null && keyPass != null

android {
    namespace = "com.fahm.quran"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.fahm.quran"
        minSdk = 26
        targetSdk = 34
        versionCode = 100 + buildNumber
        versionName = "1.0.$buildNumber"
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
