rootProject.name = "bridge"

dependencyResolutionManagement {
    repositories {
        mavenLocal()
        mavenCentral()

        val vendoredRepo = file("../vendor/xmage/repository")
        if (vendoredRepo.isDirectory) {
            maven {
                name = "xmageVendoredRepo"
                url = vendoredRepo.toURI()
            }
        }
        maven {
            name = "jbossPublic"
            url = uri("https://repository.jboss.org/nexus/content/groups/public")
        }
    }
}
