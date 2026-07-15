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
    const handlePointerDown = (e: PointerEvent) => {
      setIsAutoRotating(false);
      stateRef.current.isDragging = true;
      stateRef.current.prevPointerX = e.clientX;
      stateRef.current.prevPointerY = e.clientY;
      canvas.setPointerCapture(e.pointerId);
    };

    const handlePointerMove = (e: PointerEvent) => {
      const state = stateRef.current;
      if (!state.isDragging) return;

      const deltaX = e.clientX - state.prevPointerX;
      const deltaY = e.clientY - state.prevPointerY;

      state.prevPointerX = e.clientX;
      state.prevPointerY = e.clientY;

      // Rotate group on drag (360-degree rotation potential)
      state.targetRotationY += deltaX * 0.007;
      state.targetRotationX += deltaY * 0.007;
    };

    const handlePointerUp = () => {
      stateRef.current.isDragging = false;
    };

    canvas.addEventListener('pointerdown', handlePointerDown);
    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('pointerup', handlePointerUp);

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

      {/* Floating control helper text */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-3">
        <button
          onClick={() => setIsAutoRotating((prev) => !prev)}
          className="px-2.5 py-0.5 border border-ink/15 dark:border-white/15 bg-paper/60 dark:bg-black/60 rounded text-[9px] font-mono uppercase tracking-widest text-ink dark:text-white hover:bg-ink/5 dark:hover:bg-white/10 transition-colors"
        >
          {isAutoRotating ? 'Pause Spin' : 'Auto Spin'}
        </button>
        <span className="text-[9px] font-mono uppercase tracking-widest text-muted/60">
          Drag anywhere to rotate
        </span>
      </div>
    </section>
  );
}
