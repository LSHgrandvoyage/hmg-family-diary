plugins { id("com.android.application"); id("org.jetbrains.kotlin.android") }
android {
    namespace = "io.hmg.familydiary"
    compileSdk = 35
    useLibrary("android.car", false)
    defaultConfig {
        applicationId = "io.hmg.familydiary"
        minSdk = 28
        targetSdk = 35
        versionCode = 11
        versionName = "0.2.10"
        buildConfigField("boolean", "EMULATOR_BENCH", "false")
        buildConfigField("boolean", "LOCAL_MOCK", "false")
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }
    buildFeatures { buildConfig = true }
    flavorDimensions += "environment"
    productFlavors {
        create("demo") { dimension = "environment"; applicationIdSuffix = ".demo"; buildConfigField("boolean", "SYNTHETIC_DEMO", "true") }
        create("pleos") { dimension = "environment"; buildConfigField("boolean", "SYNTHETIC_DEMO", "false") }
        create("probe") { dimension = "environment"; applicationIdSuffix = ".probe"; buildConfigField("boolean", "SYNTHETIC_DEMO", "false"); buildConfigField("boolean", "EMULATOR_BENCH", "true") }
        create("contest") { dimension = "environment"; applicationIdSuffix = ".contest"; buildConfigField("boolean", "SYNTHETIC_DEMO", "false"); buildConfigField("boolean", "EMULATOR_BENCH", "true"); buildConfigField("boolean", "LOCAL_MOCK", "true") }
    }
    sourceSets.getByName("probe").assets.srcDir("../../web/public/faithful")
    sourceSets.getByName("contest").apply {
        java.srcDir("src/probe/java")
        res.srcDir("src/probe/res")
        assets.srcDir("../../web/public/faithful")
    }
    sourceSets.getByName("androidTestContest").assets.srcDir("src/androidTestProbe/assets")
    signingConfigs {
        if (System.getenv("CHAGOK_KEYSTORE") != null) create("contest") {
            storeFile = file(System.getenv("CHAGOK_KEYSTORE"))
            storePassword = System.getenv("CHAGOK_STORE_PASSWORD")
            keyAlias = "chagok-contest"
            keyPassword = System.getenv("CHAGOK_KEY_PASSWORD")
        }
    }
    buildTypes { release {
        isMinifyEnabled = false
        isDebuggable = false
        signingConfig = signingConfigs.findByName("contest")
    } }
    if (providers.gradleProperty("testRelease").orNull == "true") testBuildType = "release"
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
    kotlinOptions { jvmTarget = "17" }
}
androidComponents {
    beforeVariants(selector().withFlavor("environment" to "probe").withBuildType("release")) { it.enable = false }
}
dependencies {
    testImplementation("junit:junit:4.13.2")
    "contestImplementation"("ai.pleos.playground:SpeechToText:3.3.1")
    "contestImplementation"("ai.pleos.playground:FusedLocation:1.1.3")
    "contestImplementation"("ai.pleos.playground:TextToSpeech:3.3.1")
    "probeImplementation"("ai.pleos.playground:SpeechToText:3.3.1")
    "probeImplementation"("ai.pleos.playground:FusedLocation:1.1.3")
    "probeImplementation"("ai.pleos.playground:TextToSpeech:3.3.1")
    androidTestImplementation("androidx.test:runner:1.6.2")
    androidTestImplementation("junit:junit:4.13.2")
}
