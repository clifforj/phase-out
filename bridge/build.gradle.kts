plugins {
    kotlin("jvm") version "1.9.25"
    kotlin("plugin.serialization") version "1.9.25"
}

group = "online.commander"
version = "0.1.0"

// Keep Java 8 compatibility with XMage.
kotlin {
    jvmToolchain(8)
}

val ktorVersion = "2.3.13"

dependencies {

    implementation("org.mage:mage-common:1.4.61")

    implementation("io.ktor:ktor-server-core-jvm:$ktorVersion")
    implementation("io.ktor:ktor-server-cio-jvm:$ktorVersion")
    implementation("io.ktor:ktor-server-websockets-jvm:$ktorVersion")
    implementation("io.ktor:ktor-serialization-kotlinx-json-jvm:$ktorVersion")

    implementation("io.ktor:ktor-server-forwarded-header-jvm:$ktorVersion")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.6.3")

    runtimeOnly("org.slf4j:slf4j-reload4j:2.0.17")

    testImplementation(kotlin("test"))
}

tasks.test {
    useJUnitPlatform()
}

base.archivesName.set("bridge")

val runtimeLibDirName = "lib"

// Keep dependencies as separate jars, referenced through the manifest.
tasks.jar {

    archiveVersion.set("")
    manifest {
        attributes(
            "Main-Class" to "online.commander.bridge.MainKt",
            "Implementation-Version" to project.version,
            "Class-Path" to configurations.runtimeClasspath.get()
                .joinToString(" ") { "$runtimeLibDirName/${it.name}" },
        )
    }
}

val collectRuntimeLibs by tasks.registering(Sync::class) {
    from(configurations.runtimeClasspath)
    into(layout.buildDirectory.dir("libs/$runtimeLibDirName"))
}

tasks.named("assemble") {
    dependsOn(collectRuntimeLibs)
}
