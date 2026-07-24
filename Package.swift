// swift-tools-version:5.9
// SnagKit — native iOS SDK for Snag. Sources live in packages/ios/.
// The manifest sits at the repo root because SwiftPM resolves git
// dependencies from the repository root only.
import PackageDescription

let package = Package(
    name: "SnagKit",
    platforms: [
        .iOS(.v15),
        // macOS is included only so the portable core (protocol models,
        // relay client, context merging) can be built and tested off-device.
        .macOS(.v12),
    ],
    products: [
        .library(name: "SnagKit", targets: ["SnagKit"])
    ],
    targets: [
        .target(
            name: "SnagKit",
            path: "packages/ios/Sources/SnagKit"
        ),
        .testTarget(
            name: "SnagKitTests",
            dependencies: ["SnagKit"],
            path: "packages/ios/Tests/SnagKitTests"
        ),
    ]
)
