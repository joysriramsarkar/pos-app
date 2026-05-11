/**
 * Camera Debug Script
 * Helps diagnose barcode scanner camera issues
 */

export async function testCameraAccess(): Promise<void> {


  // Test 1: Check if getUserMedia is supported
  console.log("\n1. Testing getUserMedia support...");
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    console.error("❌ getUserMedia is NOT supported on this device/browser");
    return;
  }

  // Test 2: List available devices
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter(
      (device) => device.kind === "videoinput",
    );

    if (videoDevices.length === 0) {
      console.error("❌ No video devices found");
    } else {
      console.log(`✅ Found ${videoDevices.length} video device(s):`);
      videoDevices.forEach((device, index) => {
        console.log(
          `  ${index + 1}. ${device.label || `Camera ${index + 1}`} (ID: ${device.deviceId})`,
        );
      });
    }
  } catch (error) {
    console.error("❌ Error enumerating devices:", error);
  }

  // Test 3: Request camera access with different constraints
  console.log("\n3. Testing camera access with back (environment) camera...");
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "environment",
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    });

    console.log("✅ Back camera access granted");
    const videoTrack = stream.getVideoTracks()[0];
    if (videoTrack) {
      const settings = videoTrack.getSettings();
      console.log(`  Resolution: ${settings.width}x${settings.height}`);
      console.log(`  FacingMode: ${settings.facingMode}`);
    }

    stream.getTracks().forEach((track) => track.stop());
  } catch (error: unknown) {
    console.error("❌ Back camera access failed:", (error instanceof Error ? error.message : "Unknown error"));
  }

  // Test 4: Request camera access with front (user) camera
  console.log("\n4. Testing camera access with front (user) camera...");
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "user",
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    });

    console.log("✅ Front camera access granted");
    const videoTrack = stream.getVideoTracks()[0];
    if (videoTrack) {
      const settings = videoTrack.getSettings();
      console.log(`  Resolution: ${settings.width}x${settings.height}`);
      console.log(`  FacingMode: ${settings.facingMode}`);
    }

    stream.getTracks().forEach((track) => track.stop());
  } catch (error: unknown) {
    console.error("❌ Front camera access failed:", (error instanceof Error ? error.message : "Unknown error"));
  }

  // Test 5: Request camera access with no specific constraints
  console.log("\n5. Testing camera access with default constraints...");
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    console.log("✅ Generic camera access granted");

    const videoTrack = stream.getVideoTracks()[0];
    if (videoTrack) {
      const settings = videoTrack.getSettings();
      console.log(`  Resolution: ${settings.width}x${settings.height}`);
      console.log(`  FacingMode: ${settings.facingMode}`);
    }

    stream.getTracks().forEach((track) => track.stop());
  } catch (error: unknown) {
    console.error("❌ Generic camera access failed:", (error instanceof Error ? error.message : "Unknown error"));
  }

  // Test 6: Check if html5-qrcode is available
  console.log("\n6. Testing html5-qrcode library...");
  try {
    const { Html5Qrcode } = await import("html5-qrcode");
    console.log("✅ html5-qrcode library loaded successfully");
  } catch (error: unknown) {
    console.error("❌ Failed to load html5-qrcode:", (error instanceof Error ? error.message : "Unknown error"));
  }

  // Test 7: Simulate scanner initialization
  console.log("\n7. Testing scanner DOM initialization...");
  const testContainerId = "test-camera-container-debug";

  // Create test container
  let testContainer = document.getElementById(testContainerId);
  if (!testContainer) {
    testContainer = document.createElement("div");
    testContainer.id = testContainerId;
    testContainer.style.position = "fixed";
    testContainer.style.top = "0";
    testContainer.style.left = "0";
    testContainer.style.width = "100vw";
    testContainer.style.height = "100vh";
    testContainer.style.backgroundColor = "transparent";
    testContainer.style.zIndex = "-1";
    testContainer.style.display = "none";
    document.body.appendChild(testContainer);
    console.log("✅ Test container created");
  } else {
    console.log("✅ Test container already exists");
  }

  // Test camera access with raw video element
  console.log("\n8. Testing raw getUserMedia with video element...");
  try {
    const video = document.createElement("video");
    video.style.width = "100%";
    video.style.height = "100%";
    video.autoplay = true;
    video.playsInline = true;

    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
    });

    video.srcObject = stream;
    testContainer!.appendChild(video);
    testContainer!.style.display = "block";

    console.log("✅ Video element created and playing");
    console.log("   (Check your screen for camera feed)");

    // Stop after 3 seconds
    setTimeout(() => {
      stream.getTracks().forEach((track) => track.stop());
      testContainer!.style.display = "none";
      video.remove();
      console.log("✅ Test video stopped");
    }, 3000);
  } catch (error: unknown) {
    console.error("❌ Raw video test failed:", (error instanceof Error ? error.message : "Unknown error"));
  }

  console.log("\n====== END DEBUG TEST ======\n");
}

export async function testHtml5Qrcode(): Promise<void> {
  console.log("====== HTML5-QRCODE TEST ======");

  try {
    const { Html5QrcodeScanner } = await import("html5-qrcode");

    const testContainerId = "html5-qr-test-container";

    let testContainer = document.getElementById(testContainerId);
    if (!testContainer) {
      testContainer = document.createElement("div");
      testContainer.id = testContainerId;
      testContainer.style.width = "100%";
      testContainer.style.height = "400px";
      testContainer.style.backgroundColor = "#f0f0f0";
      testContainer.style.marginTop = "20px";
      document.body.appendChild(testContainer);
    }

    console.log("Creating Html5QrcodeScanner...");

    const scanner = new Html5QrcodeScanner(
      testContainerId,
      {
        fps: 10,
        qrbox: { width: 250, height: 250 },
        rememberLastUsedCamera: true,
        showTorchButtonIfSupported: true,
      },
      false,
    );

    console.log("Rendering scanner...");

    await new Promise<void>((resolve, reject) => {
      scanner.render(
        (decodedText) => {
          console.log("✅ Barcode detected:", decodedText);
        },
        (error) => {
          // Ignore scanning errors
        },
      );

      setTimeout(() => {
        console.log("✅ Scanner rendered successfully");
        resolve();
      }, 2000);
    });

    // Stop scanner after 10 seconds
    setTimeout(() => {
      scanner.clear().catch(() => {});
      console.log("✅ Scanner cleared");
    }, 10000);
  } catch (error: unknown) {
    console.error("❌ Html5QrcodeScanner test failed:", (error instanceof Error ? error.message : "Unknown error"));
    console.error("Stack:", (error instanceof Error ? error.stack : undefined));
  }

  console.log("====== END HTML5-QRCODE TEST ======\n");
}
