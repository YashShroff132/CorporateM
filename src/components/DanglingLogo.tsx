'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

export function DanglingLogo() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isAutoRotating, setIsAutoRotating] = useState(true);

  // Keep interaction state in refs for the loop
  const stateRef = useRef({
    isAutoRotating: true,
    isDragging: false,
    isScrolling: false,
    prevPointerX: 0,
    prevPointerY: 0,
    targetRotationX: 0,
    targetRotationY: 0,
    targetRotationZ: 0,
    currentRotationX: 0,
    currentRotationY: 0,
    currentRotationZ: 0,
  });

  useEffect(() => {
    stateRef.current.isAutoRotating = isAutoRotating;
  }, [isAutoRotating]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    // --- Scene Setup ---
    const scene = new THREE.Scene();

    // --- Camera ---
    const width = container.clientWidth;
    const height = container.clientHeight;
    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
    camera.position.z = 7;

    // --- Renderer ---
    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // --- Lighting ---
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight1.position.set(5, 5, 5);
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.6);
    dirLight2.position.set(-5, -5, -3);
    scene.add(dirLight2);

    const pointLight = new THREE.PointLight(0xffffff, 0.8, 10);
    pointLight.position.set(0, 0, 2);
    scene.add(pointLight);

    // --- Logo Geometry (Three Interlocking Rings) ---
    // spaced by 1.16 to create perfect tangent-touching look for radius = 0.58
    const ringRadius = 0.58;
    const tubeRadius = 0.105;
    const radialSegments = 24;
    const tubularSegments = 80;

    const torusGeo = new THREE.TorusGeometry(
      ringRadius,
      tubeRadius,
      radialSegments,
      tubularSegments
    );

    // Dynamic Materials (Theme Adaptive)
    const createMaterial = (isDark: boolean) => {
      return new THREE.MeshPhysicalMaterial({
        color: isDark ? 0xf5f5f0 : 0x222222,
        metalness: 0.95,
        roughness: isDark ? 0.15 : 0.25,
        clearcoat: 0.8,
        clearcoatRoughness: 0.1,
      });
    };

    let isDarkMode = document.documentElement.classList.contains('dark');
    const ringMat = createMaterial(isDarkMode);

    const group = new THREE.Group();

    // 3 rings centered relative to the group
    const leftRing = new THREE.Mesh(torusGeo, ringMat);
    leftRing.position.x = -1.16;

    const centerRing = new THREE.Mesh(torusGeo, ringMat);
    centerRing.position.x = 0;

    const rightRing = new THREE.Mesh(torusGeo, ringMat);
    rightRing.position.x = 1.16;

    group.add(leftRing);
    group.add(centerRing);
    group.add(rightRing);

    scene.add(group);

    // Set initial target rotation to have a premium diagonal tilt
    stateRef.current.targetRotationX = 0.25;
    stateRef.current.targetRotationY = -0.4;
    group.rotation.x = 0.25;
    group.rotation.y = -0.4;

    // --- Interaction Handlers ---
    // Compute the bounding box of the full logo group in screen-space pixels.
    // We project the 3D center and size of the group to calculate screen-space
    // half-width and half-height. This ensures the touch area perfectly matches
    // the wide, short shape of the logo and prevents touch zones extending too
    // far above or below it.
    const getLogoScreenBounds = () => {
      const box = new THREE.Box3().setFromObject(group);
      const center3D = new THREE.Vector3();
      box.getCenter(center3D);
      const size = new THREE.Vector3();
      box.getSize(size);

      // Add a small 5% padding to the dimensions
      const halfWidth3D = (size.x / 2) * 1.05;
      const halfHeight3D = (size.y / 2) * 1.05;

      // Project center to NDC then to canvas pixels
      const centerNDC = center3D.clone().project(camera);
      const rect = canvas.getBoundingClientRect();
      const cx = (centerNDC.x + 1) / 2 * rect.width + rect.left;
      const cy = (-centerNDC.y + 1) / 2 * rect.height + rect.top;

      // Project edge points to get screen-space dimensions in pixels
      const rightNDC = center3D.clone().add(new THREE.Vector3(halfWidth3D, 0, 0)).project(camera);
      const topNDC = center3D.clone().add(new THREE.Vector3(0, halfHeight3D, 0)).project(camera);

      const rx = (rightNDC.x + 1) / 2 * rect.width + rect.left;
      const ty = (-topNDC.y + 1) / 2 * rect.height + rect.top;

      const pixelHalfWidth = Math.abs(rx - cx);
      const pixelHalfHeight = Math.abs(ty - cy);

      return { cx, cy, pixelHalfWidth, pixelHalfHeight };
    };

    const handlePointerDown = (e: PointerEvent) => {
      const { cx, cy, pixelHalfWidth, pixelHalfHeight } = getLogoScreenBounds();

      // Hit test: is this touch inside the logo's bounding rectangle?
      const dx = Math.abs(e.clientX - cx);
      const dy = Math.abs(e.clientY - cy);
      const withinLogo = dx <= pixelHalfWidth && dy <= pixelHalfHeight;

      stateRef.current.prevPointerX = e.clientX;
      stateRef.current.prevPointerY = e.clientY;

      if (withinLogo) {
        // Touched anywhere within the logo visual footprint: rotate
        setIsAutoRotating(false);
        stateRef.current.isDragging = true;
        stateRef.current.isScrolling = false;
        canvas.setPointerCapture(e.pointerId);
      } else {
        // Touched outside logo: scroll page instead
        stateRef.current.isDragging = false;
        stateRef.current.isScrolling = true;
      }
    };

    const handlePointerMove = (e: PointerEvent) => {
      const state = stateRef.current;
      if (!state.isDragging && !state.isScrolling) return;

      const deltaX = e.clientX - state.prevPointerX;
      const deltaY = e.clientY - state.prevPointerY;

      state.prevPointerX = e.clientX;
      state.prevPointerY = e.clientY;

      if (state.isDragging) {
        // Only rotate the logo. Do NOT scroll the page.
        state.targetRotationY += deltaX * 0.007;
        state.targetRotationX += deltaY * 0.007;
      } else if (state.isScrolling) {
        // Only scroll the page. Do NOT rotate the logo.
        if (e.pointerType === 'touch') {
          window.scrollBy(0, -deltaY);
        }
      }
    };

    const handlePointerUp = () => {
      stateRef.current.isDragging = false;
      stateRef.current.isScrolling = false;
      setIsAutoRotating(true);
    };

    canvas.addEventListener('pointerdown', handlePointerDown);
    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('pointerup', handlePointerUp);
    canvas.addEventListener('pointercancel', handlePointerUp);
    canvas.addEventListener('pointerleave', handlePointerUp);

    // --- Animation Loop ---
    let animationFrameId: number;

    const tick = () => {
      const state = stateRef.current;

      // Sync theme adaptive color
      const currentDark = document.documentElement.classList.contains('dark');
      if (currentDark !== isDarkMode) {
        isDarkMode = currentDark;
        const newMat = createMaterial(isDarkMode);
        leftRing.material = newMat;
        centerRing.material = newMat;
        rightRing.material = newMat;
      }

      if (state.isAutoRotating) {
        // Slow rotating spin around multiple axes (yaw & roll/pitch)
        state.targetRotationY += 0.006;
        state.targetRotationX = 0.25 + Math.sin(Date.now() * 0.001) * 0.15;
      }

      // Smooth interpolation (damping) for buttery movement
      state.currentRotationX += (state.targetRotationX - state.currentRotationX) * 0.1;
      state.currentRotationY += (state.targetRotationY - state.currentRotationY) * 0.1;

      group.rotation.x = state.currentRotationX;
      group.rotation.y = state.currentRotationY;

      renderer.render(scene, camera);
      animationFrameId = requestAnimationFrame(tick);
    };

    tick();

    // --- Resize Handler ---
    const handleResize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    window.addEventListener('resize', handleResize);

    // --- Cleanup ---
    return () => {
      cancelAnimationFrame(animationFrameId);
      canvas.removeEventListener('pointerdown', handlePointerDown);
      canvas.removeEventListener('pointermove', handlePointerMove);
      canvas.removeEventListener('pointerup', handlePointerUp);
      canvas.removeEventListener('pointercancel', handlePointerUp);
      canvas.removeEventListener('pointerleave', handlePointerUp);
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
      torusGeo.dispose();
      ringMat.dispose();
    };
  }, []);

  return (
    <section
      ref={containerRef}
      className="relative w-full h-[260px] md:h-[360px] flex flex-col items-center justify-center overflow-hidden select-none bg-transparent py-4 border-b border-ink/5"
      aria-label="3D Interactive OOO Logo"
    >
      {/* 3D Canvas rendering region */}
      <canvas
        ref={canvasRef}
        className="w-full h-full cursor-grab active:cursor-grabbing outline-none touch-none"
      />
    </section>
  );
}
