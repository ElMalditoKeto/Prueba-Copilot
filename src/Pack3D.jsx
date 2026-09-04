import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

function disposeObject(object) {
  object.traverse((child) => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((material) => material.dispose());
    }
  });
}

export default function Pack3D({ geometry, resetToken = 0 }) {
  const mountRef = useRef(null);
  const sceneRef = useRef(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || !geometry) return undefined;

    const width = Math.max(mount.clientWidth, 320);
    const height = Math.max(mount.clientHeight, 420);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#eef2f7');

    const camera = new THREE.PerspectiveCamera(36, width / height, 0.1, 100);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.replaceChildren(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.minDistance = 4;
    controls.maxDistance = 22;
    controls.maxPolarAngle = Math.PI * 0.48;
    controls.target.set(0, 1.2, 0);

    const resetCamera = () => {
      camera.position.set(6.8, 5.4, 7.8);
      controls.target.set(0, 1.1, 0);
      controls.update();
    };
    resetCamera();

    scene.add(new THREE.HemisphereLight(0xffffff, 0x8a94a6, 2.1));
    const keyLight = new THREE.DirectionalLight(0xffffff, 3.2);
    keyLight.position.set(5, 9, 6);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(2048, 2048);
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0xffd5d7, 1.2);
    fillLight.position.set(-5, 3, -4);
    scene.add(fillLight);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(30, 30),
      new THREE.MeshStandardMaterial({ color: 0xdde3eb, roughness: 0.88, metalness: 0 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.02;
    floor.receiveShadow = true;
    scene.add(floor);

    const packGroup = new THREE.Group();
    scene.add(packGroup);

    const countX = geometry.orientacion === 'normal' ? geometry.ladoA : geometry.ladoB;
    const countZ = geometry.orientacion === 'normal' ? geometry.ladoB : geometry.ladoA;
    const diameterScale = 0.78;
    const bottleHeight = 3.1;
    const bodyHeightRatio = Math.min(Math.max(geometry.altCil / geometry.alt, 0.25), 0.88);
    const bodyHeight = bottleHeight * bodyHeightRatio;
    const shoulderHeight = Math.max(0.42, bottleHeight - bodyHeight - 0.38);
    const bodyRadius = diameterScale / 2;
    const neckRadius = Math.max(0.09, bodyRadius * Math.min(geometry.tapa / geometry.dia, 0.7));
    const spacing = diameterScale * 1.04;
    const packWidth = (countX - 1) * spacing + diameterScale;
    const packDepth = (countZ - 1) * spacing + diameterScale;

    const glassMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xb9d8ee,
      roughness: 0.18,
      metalness: 0,
      transmission: 0.18,
      transparent: true,
      opacity: 0.88,
      thickness: 0.16,
    });
    const liquidMaterial = new THREE.MeshStandardMaterial({ color: 0x3b160d, roughness: 0.42 });
    const capMaterial = new THREE.MeshStandardMaterial({ color: 0xe31b23, roughness: 0.48 });

    for (let xIndex = 0; xIndex < countX; xIndex += 1) {
      for (let zIndex = 0; zIndex < countZ; zIndex += 1) {
        const bottle = new THREE.Group();
        const x = xIndex * spacing - ((countX - 1) * spacing) / 2;
        const z = zIndex * spacing - ((countZ - 1) * spacing) / 2;
        bottle.position.set(x, 0, z);

        const liquid = new THREE.Mesh(
          new THREE.CylinderGeometry(bodyRadius * 0.82, bodyRadius * 0.86, bodyHeight * 0.9, 28),
          liquidMaterial
        );
        liquid.position.y = bodyHeight * 0.46;
        bottle.add(liquid);

        const body = new THREE.Mesh(
          new THREE.CylinderGeometry(bodyRadius, bodyRadius, bodyHeight, 32),
          glassMaterial
        );
        body.position.y = bodyHeight / 2;
        body.castShadow = true;
        bottle.add(body);

        const shoulder = new THREE.Mesh(
          new THREE.CylinderGeometry(neckRadius * 1.25, bodyRadius, shoulderHeight, 32),
          glassMaterial
        );
        shoulder.position.y = bodyHeight + shoulderHeight / 2;
        shoulder.castShadow = true;
        bottle.add(shoulder);

        const neck = new THREE.Mesh(
          new THREE.CylinderGeometry(neckRadius, neckRadius, 0.34, 24),
          glassMaterial
        );
        neck.position.y = bodyHeight + shoulderHeight + 0.17;
        bottle.add(neck);

        const cap = new THREE.Mesh(
          new THREE.CylinderGeometry(neckRadius * 1.12, neckRadius * 1.12, 0.16, 24),
          capMaterial
        );
        cap.position.y = bodyHeight + shoulderHeight + 0.42;
        cap.castShadow = true;
        bottle.add(cap);
        packGroup.add(bottle);
      }
    }

    const filmColor = geometry.tipoFilm === 'arte' ? 0xef1f25 : 0xdceeff;
    const filmMaterial = new THREE.MeshPhysicalMaterial({
      color: filmColor,
      transparent: true,
      opacity: geometry.tipoFilm === 'arte' ? 0.23 : 0.17,
      roughness: 0.14,
      metalness: 0,
      transmission: geometry.tipoFilm === 'arte' ? 0.05 : 0.72,
      thickness: 0.08,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const filmHeight = bottleHeight * 0.88;
    const film = new THREE.Mesh(
      new THREE.BoxGeometry(packWidth + 0.28, filmHeight, packDepth + 0.28),
      filmMaterial
    );
    film.position.y = filmHeight / 2;
    film.renderOrder = 2;
    packGroup.add(film);

    const filmEdges = new THREE.LineSegments(
      new THREE.EdgesGeometry(film.geometry),
      new THREE.LineBasicMaterial({ color: 0xef1f25, transparent: true, opacity: 0.56 })
    );
    filmEdges.position.copy(film.position);
    packGroup.add(filmEdges);

    const filmBand = new THREE.Mesh(
      new THREE.BoxGeometry(packWidth + 0.3, 0.28, packDepth + 0.3),
      new THREE.MeshStandardMaterial({
        color: 0xef1f25,
        transparent: true,
        opacity: geometry.tipoFilm === 'arte' ? 0.74 : 0.18,
        depthWrite: false,
      })
    );
    filmBand.position.y = filmHeight * 0.56;
    packGroup.add(filmBand);

    const grid = new THREE.GridHelper(16, 16, 0xa8b1c0, 0xd2d8e1);
    grid.position.y = 0.005;
    scene.add(grid);

    sceneRef.current = { resetCamera };
    let frameId;
    const render = () => {
      controls.update();
      renderer.render(scene, camera);
      frameId = requestAnimationFrame(render);
    };
    render();

    const resizeObserver = new ResizeObserver(() => {
      const nextWidth = Math.max(mount.clientWidth, 320);
      const nextHeight = Math.max(mount.clientHeight, 420);
      camera.aspect = nextWidth / nextHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(nextWidth, nextHeight);
    });
    resizeObserver.observe(mount);

    return () => {
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      controls.dispose();
      disposeObject(scene);
      renderer.dispose();
      sceneRef.current = null;
      mount.replaceChildren();
    };
  }, [geometry]);

  useEffect(() => {
    if (resetToken > 0) sceneRef.current?.resetCamera();
  }, [resetToken]);

  return <div ref={mountRef} className="pack-3d-canvas" aria-label="Visualizador 3D del pack" />;
}
