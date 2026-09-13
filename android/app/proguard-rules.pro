# Project specific ProGuard rules

# Preserve line numbers and source file names for crash reports / Play Console deobfuscation
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# Preserve annotations and interfaces
-keepattributes *Annotation*
-keepattributes JavascriptInterface
-keepattributes Signature
-keepattributes Exceptions

# Capacitor Core and Bridge
-keep public class * extends com.getcapacitor.Plugin {
    public <methods>;
}
-keep public class * extends com.getcapacitor.BridgeActivity
-keep public class com.getcapacitor.** { *; }

# WebView JavaScript Interfaces
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Plugins
-keep class io.capawesome.capacitorjs.plugins.mlkit.barcodescanning.** { *; }
-keep class com.capacitorjs.plugins.** { *; }
