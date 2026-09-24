import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

function disposeScene(scene) {
  scene.traverse((object) => {
    object.geometry?.dispose();
    if (object.material) {
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach((material) => {
        material.map?.dispose();
        material.dispose();
      });
    }
  });
}

function createEnvelopeGeometry({ lowerWidth, lowerDepth, upperWidth, upperDepth, shoulderHeight, totalHeight }) {
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  const rings = [
    { y: 0.025, width: lowerWidth, depth: lowerDepth },
    { y: shoulderHeight, width: lowerWidth, depth: lowerDepth },
    { y: totalHeight, width: upperWidth, depth: upperDepth },
  ];
  const positions = [];
  rings.forEach((ring) => corners.forEach(([sx, sz]) => {
    positions.push(sx * ring.width / 2, ring.y, sz * ring.depth / 2);
  }));
  const indices = [];
  for (let ring = 0; ring < 2; ring += 1) {
    const current = ring * 4;
    const next = (ring + 1) * 4;
    for (let side = 0; side < 4; side += 1) {
      const following = (side + 1) % 4;
      indices.push(current + side, next + side, next + following);
      indices.push(current + side, next + following, current + following);
    }
  }
  indices.push(8, 9, 10, 8, 10, 11);
  const result = new THREE.BufferGeometry();
  result.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  result.setIndex(indices);
  result.computeVertexNormals();
  return result;
}

function createLabelSprite(text, accent = '#e61c24') {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = 'rgba(255,255,255,0.94)';
  context.strokeStyle = accent;
  context.lineWidth = 5;
  context.beginPath();
  context.roundRect(8, 8, 496, 112, 22);
  context.fill();
  context.stroke();
  context.fillStyle = '#172033';
  context.font = 'bold 42px Arial';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(text, 256, 66);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(1.55, 0.39, 1);
  sprite.renderOrder = 20;
  return sprite;
}

function addProfileAnnotations(group, { lowerWidth, lowerDepth, upperWidth, shoulderHeight, totalHeight, points, solape, scale }) {
  const z = lowerDepth / 2 + 0.055;
  const left = -lowerWidth / 2;
  const right = lowerWidth / 2;
  const upperLeft = -upperWidth / 2;
  const upperRight = upperWidth / 2;
  const locations = {
    A: new THREE.Vector3(left, 0.04, z),
    B: new THREE.Vector3(left, shoulderHeight, z),
    C: new THREE.Vector3(upperLeft, totalHeight, z),
    D: new THREE.Vector3(upperRight, totalHeight, z),
    E: new THREE.Vector3(right, shoulderHeight, z),
    F: new THREE.Vector3(right, 0.04, z),
  };

  const profileMaterial = new THREE.LineBasicMaterial({ color: 0xe61c24, linewidth: 2, depthTest: false });
  const profile = ['A', 'B', 'C', 'D', 'E', 'F'].map((key) => locations[key]);
  profile.push(locations.A.clone());
  const profileLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(profile), profileMaterial);
  profileLine.renderOrder = 12;
  group.add(profileLine);

  Object.entries(locations).forEach(([key, position]) => {
    const dot = new THREE.Mesh(
      new THREE.SphereGeometry(0.055, 18, 18),
      new THREE.MeshBasicMaterial({ color: 0xe61c24, depthTest: false })
    );
    dot.position.copy(position);
    dot.renderOrder = 14;
    group.add(dot);

    const value = Number(points?.[key] ?? 0).toFixed(2);
    const label = createLabelSprite(`${key}  ${value} mm`);
    const horizontalOffset = ['A', 'B', 'C'].includes(key) ? -0.92 : 0.92;
    const verticalOffset = key === 'A' || key === 'F' ? 0.18 : key === 'C' || key === 'D' ? 0.28 : 0;
    label.position.set(position.x + horizontalOffset, position.y + verticalOffset, z + 0.04);
    group.add(label);
  });

  const seamPoint = new THREE.Vector3(0, 0.048, z + 0.015);
  const seamDot = new THREE.Mesh(
    new THREE.SphereGeometry(0.065, 18, 18),
    new THREE.MeshBasicMaterial({ color: 0x059669, depthTest: false })
  );
  seamDot.position.copy(seamPoint);
  seamDot.renderOrder = 15;
  group.add(seamDot);

  const seamLabel = createLabelSprite(`S/SS  ${solape.toFixed(1)} mm`, '#059669');
  seamLabel.position.set(0, 0.42, z + 0.05);
  group.add(seamLabel);

  const overlapWidth = Math.max(solape * scale, 0.04);
  const overlap = new THREE.Mesh(
    new THREE.PlaneGeometry(overlapWidth, lowerDepth * 0.9),
    new THREE.MeshBasicMaterial({ color: 0x0b8ee0, transparent: true, opacity: 0.62, side: THREE.DoubleSide, depthTest: false })
  );
  overlap.rotation.x = -Math.PI / 2;
  overlap.position.set(0, 0.035, 0);
  overlap.renderOrder = 10;
  group.add(overlap);
}


function createCroppedTexture(imageUrl, crop, invertido, onReady) {
  const image = new Image();
  image.onload = () => {
    const left = Math.max(0, Math.min(45, crop?.izquierda ?? 0)) / 100;
    const right = Math.max(0, Math.min(45, crop?.derecha ?? 0)) / 100;
    const top = Math.max(0, Math.min(45, crop?.superior ?? 0)) / 100;
    const bottom = Math.max(0, Math.min(45, crop?.inferior ?? 0)) / 100;
    const sourceX = image.width * left;
    const sourceY = image.height * top;
    const sourceWidth = image.width * Math.max(0.05, 1 - left - right);
    const sourceHeight = image.height * Math.max(0.05, 1 - top - bottom);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(512, Math.round(sourceWidth));
    canvas.height = Math.max(256, Math.round(sourceHeight));
    const context = canvas.getContext('2d');
    context.save();
    if (invertido) {
      context.translate(canvas.width, 0);
      context.scale(-1, 1);
    }
    context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height);
    context.restore();
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.anisotropy = 8;
    texture.needsUpdate = true;
    onReady(texture);
  };
  image.src = imageUrl;
}

function createArtworkRibbon({ profile, halfDepth, uValues }) {
  const positions = [];
  const uvs = [];
  const indices = [];
  for (let index = 0; index < profile.length; index += 1) {
    const point = profile[index];
    positions.push(point.x, point.y, -halfDepth, point.x, point.y, halfDepth);
    uvs.push(uValues[index], 0, uValues[index], 1);
  }
  for (let index = 0; index < profile.length - 1; index += 1) {
    const a = index * 2;
    const b = a + 1;
    const c = a + 2;
    const d = a + 3;
    indices.push(a, c, d, a, d, b);
  }
  const result = new THREE.BufferGeometry();
  result.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  result.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  result.setIndex(indices);
  result.computeVertexNormals();
  return result;
}

export default function Pack3D({ geometry, resetToken = 0 }) {
  const mountRef = useRef(null);
  const controlsRef = useRef(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || !geometry) return undefined;
    const width = Math.max(mount.clientWidth, 320);
    const height = Math.max(mount.clientHeight, 420);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#edf4fb');
    const camera = new THREE.PerspectiveCamera(35, width / height, 0.1, 100);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = true;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.replaceChildren(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.minDistance = 4;
    controls.maxDistance = 24;
    controls.maxPolarAngle = Math.PI * 0.49;
    const resetCamera = () => {
      camera.position.set(7.3, 5.4, 8.4);
      controls.target.set(0, 1.25, 0);
      controls.update();
    };
    resetCamera();
    controlsRef.current = { resetCamera };

    scene.add(new THREE.HemisphereLight(0xffffff, 0x718296, 2.4));
    const mainLight = new THREE.DirectionalLight(0xffffff, 3.2);
    mainLight.position.set(5, 9, 6);
    mainLight.castShadow = true;
    scene.add(mainLight);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(30, 30),
      new THREE.MeshStandardMaterial({ color: 0xdfe7f0, roughness: 0.92 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.02;
    floor.receiveShadow = true;
    scene.add(floor);
    const grid = new THREE.GridHelper(16, 16, 0x98a9ba, 0xcbd6e2);
    grid.position.y = 0.005;
    scene.add(grid);

    const countX = geometry.orientacion === 'normal' ? geometry.ladoA : geometry.ladoB;
    const countZ = geometry.orientacion === 'normal' ? geometry.ladoB : geometry.ladoA;
    const renderedDiameter = 0.78;
    const scale = renderedDiameter / geometry.dia;
    const totalHeight = geometry.alt * scale;
    const shoulderStart = Math.min(geometry.altCil, geometry.alt) * scale;
    const bodyRadius = renderedDiameter / 2;
    const capRadius = Math.max(0.08, geometry.tapa * scale / 2);
    const upperHeight = Math.max(totalHeight - shoulderStart, totalHeight * 0.12);
    const capHeight = Math.min(totalHeight * 0.055, upperHeight * 0.2);
    const neckHeight = Math.min(totalHeight * 0.08, upperHeight * 0.23);
    const shoulderHeight = Math.max(upperHeight - neckHeight - capHeight, totalHeight * 0.06);
    const spacing = renderedDiameter * 1.03;
    const lowerWidth = (countX - 1) * spacing + renderedDiameter + renderedDiameter * 0.055;
    const lowerDepth = (countZ - 1) * spacing + renderedDiameter + renderedDiameter * 0.055;
    const upperWidth = (countX - 1) * spacing + capRadius * 2.25 + renderedDiameter * 0.055;
    const upperDepth = (countZ - 1) * spacing + capRadius * 2.25 + renderedDiameter * 0.055;

    const pack = new THREE.Group();
    scene.add(pack);
    const glass = new THREE.MeshPhysicalMaterial({ color: 0xc7e0ef, transparent: true, opacity: 0.84, roughness: 0.18, transmission: 0.18 });
    const liquid = new THREE.MeshStandardMaterial({ color: 0x2d110b, roughness: 0.4 });
    const labelMaterial = new THREE.MeshStandardMaterial({ color: 0xe51c2a, roughness: 0.48 });
    const capMaterial = new THREE.MeshStandardMaterial({ color: 0xe31b23, roughness: 0.5 });

    for (let x = 0; x < countX; x += 1) {
      for (let z = 0; z < countZ; z += 1) {
        const bottle = new THREE.Group();
        bottle.position.set(x * spacing - ((countX - 1) * spacing) / 2, 0, z * spacing - ((countZ - 1) * spacing) / 2);
        const liquidMesh = new THREE.Mesh(new THREE.CylinderGeometry(bodyRadius * 0.83, bodyRadius * 0.87, shoulderStart * 0.9, 28), liquid);
        liquidMesh.position.y = shoulderStart * 0.45;
        bottle.add(liquidMesh);
        const body = new THREE.Mesh(new THREE.CylinderGeometry(bodyRadius, bodyRadius, shoulderStart, 32), glass);
        body.position.y = shoulderStart / 2;
        body.castShadow = true;
        bottle.add(body);
        const label = new THREE.Mesh(new THREE.CylinderGeometry(bodyRadius * 1.012, bodyRadius * 1.012, shoulderStart * 0.27, 32, 1, true), labelMaterial);
        label.position.y = shoulderStart * 0.58;
        bottle.add(label);
        const shoulder = new THREE.Mesh(new THREE.CylinderGeometry(capRadius * 1.28, bodyRadius, shoulderHeight, 32), glass);
        shoulder.position.y = shoulderStart + shoulderHeight / 2;
        bottle.add(shoulder);
        const neck = new THREE.Mesh(new THREE.CylinderGeometry(capRadius, capRadius * 1.1, neckHeight, 24), glass);
        neck.position.y = shoulderStart + shoulderHeight + neckHeight / 2;
        bottle.add(neck);
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(capRadius * 1.12, capRadius * 1.12, capHeight, 24), capMaterial);
        cap.position.y = totalHeight - capHeight / 2;
        bottle.add(cap);
        pack.add(bottle);
      }
    }

    const filmGeometry = createEnvelopeGeometry({ lowerWidth, lowerDepth, upperWidth, upperDepth, shoulderHeight: shoulderStart, totalHeight });
    const film = new THREE.Mesh(filmGeometry, new THREE.MeshPhysicalMaterial({
      color: 0x2396df,
      transparent: true,
      opacity: geometry.tipoFilm === 'arte' && geometry.arte ? 0.08 : 0.28,
      roughness: 0.18,
      transmission: geometry.tipoFilm === 'arte' && geometry.arte ? 0.05 : 0.48,
      side: THREE.DoubleSide,
      depthWrite: false,
    }));
    film.renderOrder = 3;
    pack.add(film);
    const outline = new THREE.LineSegments(new THREE.EdgesGeometry(filmGeometry), new THREE.LineBasicMaterial({ color: 0x0878c4, transparent: true, opacity: 0.82 }));
    outline.renderOrder = 4;
    pack.add(outline);

    if (geometry.tipoFilm === 'arte' && geometry.arte?.imagen) {
      const cutLength = Math.max(Number(geometry.largoCorte ?? 1), 1);
      const artLength = Math.max(Number(geometry.arte.largo ?? cutLength), 1);
      const offset = Number(geometry.arte.offset ?? 0);
      const pointValues = geometry.puntos ?? {};
      const cumulative = [
        0,
        Number(pointValues.A ?? 0),
        Number(pointValues.B ?? 0),
        Number(pointValues.C ?? 0),
        Number(pointValues.D ?? 0),
        Number(pointValues.E ?? 0),
        Number(pointValues.F ?? 0),
        cutLength,
      ];
      const profile = [
        new THREE.Vector2(0, 0.055),
        new THREE.Vector2(-lowerWidth / 2, 0.055),
        new THREE.Vector2(-lowerWidth / 2, shoulderStart),
        new THREE.Vector2(-upperWidth / 2, totalHeight),
        new THREE.Vector2(upperWidth / 2, totalHeight),
        new THREE.Vector2(lowerWidth / 2, shoulderStart),
        new THREE.Vector2(lowerWidth / 2, 0.055),
        new THREE.Vector2(0, 0.065),
      ];
      const uValues = cumulative.map((value) => (value + offset) / artLength);
      const artworkGeometry = createArtworkRibbon({
        profile,
        halfDepth: lowerDepth / 2 + 0.012,
        uValues,
      });
      createCroppedTexture(
        geometry.arte.imagen,
        geometry.arte.recorte,
        Boolean(geometry.arte.invertido),
        (texture) => {
          const artworkMaterial = new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
            opacity: 0.92,
            side: THREE.DoubleSide,
            depthWrite: false,
          });
          const artwork = new THREE.Mesh(artworkGeometry, artworkMaterial);
          artwork.renderOrder = 7;
          pack.add(artwork);
        }
      );
    }

    addProfileAnnotations(pack, {
      lowerWidth,
      lowerDepth,
      upperWidth,
      shoulderHeight: shoulderStart,
      totalHeight,
      points: geometry.puntos,
      solape: Number(geometry.solape ?? 10),
      scale,
    });

    let frame;
    const render = () => {
      controls.update();
      renderer.render(scene, camera);
      frame = requestAnimationFrame(render);
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
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      controls.dispose();
      disposeScene(scene);
      renderer.dispose();
      controlsRef.current = null;
      mount.replaceChildren();
    };
  }, [geometry]);

  useEffect(() => {
    if (resetToken > 0) controlsRef.current?.resetCamera();
  }, [resetToken]);

  return <div ref={mountRef} className="pack-3d-canvas" aria-label="Visualizador 3D con cotas A-F y solape S/SS" />;
}
