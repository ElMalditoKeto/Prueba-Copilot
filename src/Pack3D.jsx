import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

function createBottle(geometry, material) {
  const bottle = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.42, 0.42, 1.05, 32),
    material,
  );
  body.position.y = 0.58;
  bottle.add(body);

  const shoulder = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.42, 0.22, 32),
    material,
  );
  shoulder.position.y = 1.2;
  bottle.add(shoulder);

  const neck = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.18, 0.2, 32),
    material,
  );
  neck.position.y = 1.41;
  bottle.add(neck);

  const cap = new THREE.Mesh(
    new THREE.CylinderGeometry(0.2, 0.2, 0.14, 32),
    new THREE.MeshStandardMaterial({ color: '#d8dee8', roughness: 0.38, metalness: 0.18 }),
  );
  cap.position.y = 1.58;
  bottle.add(cap);

  geometry.push(...bottle.children.map((part) => part.geometry));
  return bottle;
}

export default function Pack3D({ geometry, resetToken }) {
  const mountRef = useRef(null);
  const cameraState = useRef({ yaw: 0.62, pitch: 0.34, distance: 5.8 });

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || !geometry) return undefined;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#f8fafc');
    scene.fog = new THREE.Fog('#f8fafc', 7, 14);

    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight('#ffffff', '#cbd5e1', 2.2));
    const keyLight = new THREE.DirectionalLight('#ffffff', 2.5);
    keyLight.position.set(3, 5, 4);
    scene.add(keyLight);

    const resources = [];
    const pack = new THREE.Group();
    const filmMaterial = new THREE.MeshPhysicalMaterial({
      color: geometry.tipoFilm === 'arte' ? '#f6b8bb' : '#e8eef5',
      transparent: true,
      opacity: 0.28,
      roughness: 0.2,
      transmission: 0.25,
      side: THREE.DoubleSide,
    });
    const bottleMaterial = new THREE.MeshStandardMaterial({
      color: geometry.tipoFilm === 'arte' ? '#f28b91' : '#dbeafe',
      transparent: true,
      opacity: 0.88,
      roughness: 0.28,
    });
    resources.push(filmMaterial, bottleMaterial);

    const across = Math.max(1, Math.min(geometry.ladoA, 8));
    const deep = Math.max(1, Math.min(geometry.ladoB, 8));
    const spacing = 0.9;
    const width = (across - 1) * spacing + 0.86;
    const depth = (deep - 1) * spacing + 0.86;
    const film = new THREE.Mesh(
      new THREE.BoxGeometry(width + 0.22, 1.86, depth + 0.22),
      filmMaterial,
    );
    film.position.y = 0.86;
    pack.add(film);
    resources.push(film.geometry);

    for (let row = 0; row < deep; row += 1) {
      for (let column = 0; column < across; column += 1) {
        const bottle = createBottle(resources, bottleMaterial);
        bottle.position.set(
          (column - (across - 1) / 2) * spacing,
          0,
          (row - (deep - 1) / 2) * spacing,
        );
        pack.add(bottle);
      }
    }

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(3.4, 64),
      new THREE.ShadowMaterial({ color: '#64748b', opacity: 0.16 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.02;
    scene.add(floor);
    resources.push(floor.geometry, floor.material);
    scene.add(pack);

    const state = cameraState.current;
    const updateCamera = () => {
      camera.position.set(
        Math.sin(state.yaw) * Math.cos(state.pitch) * state.distance,
        Math.sin(state.pitch) * state.distance + 0.8,
        Math.cos(state.yaw) * Math.cos(state.pitch) * state.distance,
      );
      camera.lookAt(0, 0.82, 0);
    };
    updateCamera();

    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    const onPointerDown = (event) => {
      dragging = true;
      lastX = event.clientX;
      lastY = event.clientY;
      renderer.domElement.setPointerCapture(event.pointerId);
    };
    const onPointerMove = (event) => {
      if (!dragging) return;
      state.yaw -= (event.clientX - lastX) * 0.012;
      state.pitch = THREE.MathUtils.clamp(state.pitch + (event.clientY - lastY) * 0.01, -0.15, 1.15);
      lastX = event.clientX;
      lastY = event.clientY;
      updateCamera();
    };
    const onPointerUp = () => { dragging = false; };
    const onWheel = (event) => {
      event.preventDefault();
      state.distance = THREE.MathUtils.clamp(state.distance + event.deltaY * 0.004, 3.2, 9);
      updateCamera();
    };
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerup', onPointerUp);
    renderer.domElement.addEventListener('pointercancel', onPointerUp);
    renderer.domElement.addEventListener('wheel', onWheel, { passive: false });

    const resize = () => {
      const widthValue = mount.clientWidth || 640;
      const heightValue = mount.clientHeight || 420;
      camera.aspect = widthValue / heightValue;
      camera.updateProjectionMatrix();
      renderer.setSize(widthValue, heightValue, false);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(mount);

    let frame;
    const animate = () => {
      frame = requestAnimationFrame(animate);
      pack.rotation.y += 0.002;
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('pointercancel', onPointerUp);
      renderer.domElement.removeEventListener('wheel', onWheel);
      resources.forEach((resource) => resource.dispose?.());
      renderer.dispose();
      mount.removeChild(renderer.domElement);
    };
  }, [geometry, resetToken]);

  return <div ref={mountRef} className="pack-3d-canvas" aria-label="Modelo 3D del pack" />;
}
