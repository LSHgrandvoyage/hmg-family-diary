plugins { id("com.android.application"); id("org.jetbrains.kotlin.android") }
android {
    namespace = "io.hmg.familydiary"
    compileSdk = 35
    defaultConfig {
        applicationId = "io.hmg.familydiary"
        minSdk = 28
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"
    }
    buildFeatures { buildConfig = true }
    flavorDimensions += "environment"
    productFlavors {
        create("demo") { dimension = "environment"; applicationIdSuffix = ".demo"; buildConfigField("boolean", "SYNTHETIC_DEMO", "true") }
        create("pleos") { dimension = "environment"; buildConfigField("boolean", "SYNTHETIC_DEMO", "false") }
    }
    buildTypes { release { isMinifyEnabled = false } }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
    kotlinOptions { jvmTarget = "17" }
}
dependencies { testImplementation("junit:junit:4.13.2") }
