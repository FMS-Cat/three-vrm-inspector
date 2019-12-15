import * as THREE from 'three';
import { GLTF, GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { VRM, VRMDebug, VRMSchema } from '@pixiv/three-vrm';
import CameraControls from 'camera-controls';
import EventEmitter from 'eventemitter3';

CameraControls.install( { THREE } );

export class Inspector extends EventEmitter {
  private _scene: THREE.Scene;
  private _camera: THREE.PerspectiveCamera;
  private _renderer?: THREE.WebGLRenderer;
  private _controls?: CameraControls;
  private _gltf?: GLTF;
  private _vrm?: VRMDebug;
  private _loader: GLTFLoader = new GLTFLoader();
  private _canvas?: HTMLCanvasElement;
  private _layerMode: 'firstPerson' | 'thirdPerson' = 'thirdPerson';
  private _handleResize?: () => void;

  public get scene(): THREE.Scene { return this._scene; }
  public get gltf(): GLTF | undefined { return this._gltf; }
  public get vrm(): VRMDebug | undefined { return this._vrm; }
  public get canvas(): HTMLCanvasElement | undefined { return this._canvas; }
  public get layerMode(): 'firstPerson' | 'thirdPerson' { return this._layerMode; }

  public set layerMode( mode: 'firstPerson' | 'thirdPerson' ) {
    this._layerMode = mode;
    this._updateLayerMode();
  }

  public constructor() {
    super();

    // camera
    this._camera = new THREE.PerspectiveCamera(
      30.0,
      window.innerWidth / window.innerHeight,
      0.1,
      20.0
    );
    this._camera.position.set( 0.0, 1.0, 5.0 );

    // scene
    this._scene = new THREE.Scene();

    // light
    const light = new THREE.DirectionalLight( 0xffffff );
    light.position.set( 1.0, 1.0, 1.0 ).normalize();
    this._scene.add( light );

    // helpers
    const gridHelper = new THREE.GridHelper( 10, 10 );
    this._scene.add( gridHelper );

    const axesHelper = new THREE.AxesHelper( 5 );
    this._scene.add( axesHelper );
  }

  public loadVRM( url: string ): Promise<VRM> {
    return new Promise<VRM>( ( resolve, reject ) => {
      this._loader.crossOrigin = 'anonymous';
      this._loader.load(
        url,
        ( gltf ) => {
          this._gltf = gltf;

          VRM.from( gltf ).then( ( vrm ) => {
            if ( this._vrm ) {
              this._scene.remove( this._vrm.scene );
              this._vrm.dispose();
            }

            this._vrm = vrm;
            this._scene.add( vrm.scene );

            this._vrm.firstPerson!.setup();
            this._updateLayerMode();

            const hips = vrm.humanoid!.getBoneNode( VRMSchema.HumanoidBoneName.Hips )!;
            hips.rotation.y = Math.PI;

            this.emit( 'load', vrm );
            resolve( vrm );
          } );
        },
        ( progress ) => { this.emit( 'progress', progress ); },
        ( error ) => { this.emit( 'error', error ); reject( error ); }
      );
    } );
  }

  public setup( canvas: HTMLCanvasElement ): void {
    this._canvas = canvas;

    // renderer
    this._renderer = new THREE.WebGLRenderer( { canvas: this._canvas } );
    this._renderer.setSize( window.innerWidth, window.innerHeight );
    this._renderer.setPixelRatio( window.devicePixelRatio );

    // camera controls
    this._controls = new CameraControls( this._camera, this._canvas );
    this._controls.setTarget( 0.0, 1.0, 0.0 );

    // resize listener
    if ( this._handleResize ) {
      window.removeEventListener( 'resize', this._handleResize );
    }
    this._handleResize = () => {
      this._camera.aspect = window.innerWidth / window.innerHeight;
      this._camera.updateProjectionMatrix();

      this._renderer!.setSize( window.innerWidth, window.innerHeight );
    };
    window.addEventListener( 'resize', this._handleResize );
  }

  public registerDnD( target: HTMLElement ): () => void {
    const handleDragOver = ( event: DragEvent ): void => {
      event.preventDefault();
    };

    const handleDrop = ( event: DragEvent ): void => {
      event.preventDefault();

      // read given file then convert it to blob url
      const files = event.dataTransfer!.files;
      if ( !files ) { return; }
      const file = files[ 0 ];
      if ( !file ) { return; }
      const blob = new Blob( [ file ], { type: 'application/octet-stream' } );
      const url = URL.createObjectURL( blob );
      this.loadVRM( url );
    };

    target.addEventListener( 'dragover', handleDragOver );
    target.addEventListener( 'drop', handleDrop );

    return () => {
      target.removeEventListener( 'dragover', handleDragOver );
      target.removeEventListener( 'drop', handleDrop );
    };
  }

  public update( delta: number ): void {
    if ( this._controls ) { this._controls.update( delta ); }
    if ( this._vrm ) { this._vrm.update( delta ); }

    if ( this._renderer ) {
      this._renderer.render( this._scene, this._camera );
    }
  }

  private _updateLayerMode(): void {
    if ( !this._vrm ) { throw new Error( 'bazinga' ); }

    if ( this._layerMode === 'firstPerson' ) {
      this._camera.layers.enable( this._vrm.firstPerson!.firstPersonOnlyLayer );
      this._camera.layers.disable( this._vrm.firstPerson!.thirdPersonOnlyLayer );
    } else {
      this._camera.layers.disable( this._vrm.firstPerson!.firstPersonOnlyLayer );
      this._camera.layers.enable( this._vrm.firstPerson!.thirdPersonOnlyLayer );
    }
  }
}