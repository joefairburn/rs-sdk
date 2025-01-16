import Linkable from '#/datastruct/Linkable.js';

import GroundDecor from '#/dash3d/type/GroundDecor.js';
import Location from '#/dash3d/type/Loc.js';
import ObjStack from '#/dash3d/type/ObjStack.js';
import TileOverlay from '#/dash3d/type/TileOverlay.js';
import TileUnderlay from '#/dash3d/type/TileUnderlay.js';
import Wall from '#/dash3d/type/Wall.js';
import Decor from '#/dash3d/type/Decor.js';

import { TypedArray1d } from '#/util/Arrays.js';

export default class Ground extends Linkable {
    // constructor
    level: number;
    readonly x: number;
    readonly z: number;
    readonly occludeLevel: number;
    readonly locs: (Location | null)[];
    readonly locSpan: Int32Array;

    // runtime
    underlay: TileUnderlay | null = null;
    overlay: TileOverlay | null = null;
    wall: Wall | null = null;
    wallDecoration: Decor | null = null;
    groundDecoration: GroundDecor | null = null;
    objStack: ObjStack | null = null;
    bridge: Ground | null = null;
    locCount: number = 0;
    locSpans: number = 0;
    drawLevel: number = 0;
    visible: boolean = false;
    update: boolean = false;
    containsLocs: boolean = false;
    checkLocSpans: number = 0;
    blockLocSpans: number = 0;
    inverseBlockLocSpans: number = 0;
    backWallTypes: number = 0;

    constructor(level: number, x: number, z: number) {
        super();
        this.occludeLevel = this.level = level;
        this.x = x;
        this.z = z;
        this.locs = new TypedArray1d(5, null);
        this.locSpan = new Int32Array(5);
    }
}
