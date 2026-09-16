export const CARD_W = 0.8;
export const CARD_H = CARD_W * (88 / 63);

export const BOARD_CARD_W = CARD_W;
export const BOARD_ART_H = BOARD_CARD_W * (457 / 626);
export const BOARD_CREDIT_H = BOARD_CARD_W * 0.086;
export const BOARD_CARD_H = BOARD_ART_H + BOARD_CREDIT_H;

export const ROW_MAX_W = 4.8;
export const ROW_GAP = 0.16;

const ROW_CARDS = 9;
export const POD_ROW_MAX_W = CARD_W + (ROW_CARDS - 1) * (CARD_W + ROW_GAP);

const ROW_Z_CREATURE = 1.2;
export const ROW_Z = {
  combat: ROW_Z_CREATURE - BOARD_CARD_H - ROW_GAP,
  creature: ROW_Z_CREATURE,
  land: ROW_Z_CREATURE + BOARD_CARD_W + ROW_GAP,
} as const;

export const LAND_PILE_STEP_COSMETIC = 0.12;
export const LAND_PILE_STEP_CREDIT = BOARD_CREDIT_H * 1.4;
const LAND_PILE_FAN_DEPTH = 5;
export const LAND_PILE_FAN_MAX_COSMETIC = LAND_PILE_STEP_COSMETIC * LAND_PILE_FAN_DEPTH;
export const LAND_PILE_FAN_MAX_CREDIT = LAND_PILE_STEP_CREDIT * LAND_PILE_FAN_DEPTH;

export const SIDE_GAP = 1.05;
export const SUPPORT_Z = 1.4;
export const SUPPORT_MAX_D = 1.8;

export const ATTACHMENT_SCALE = 0.6;
export const ATTACHMENT_DX = BOARD_CARD_W * 0.36;
export const ATTACHMENT_DZ = BOARD_CARD_H * 0.36;
export const ATTACHMENT_FAN_DZ = BOARD_CARD_H * 0.18;

export const ATTACHMENT_SLIDE_DZ = BOARD_CARD_H * 0.42;

export const ATTACHMENT_LAYERS = 5;

export const PILE_SCALE = 0.7;
export const PILE_CARD_W = BOARD_CARD_W * PILE_SCALE;
export const PILE_CARD_H = BOARD_CARD_H * PILE_SCALE;

export const LAND_SCALE = 0.9;

export const PILE_AREA_W = PILE_CARD_W + 0.18;
export const PILE_AREA_H = PILE_CARD_H + 0.18;
export const PILE_GAP = 0.1;
export const PILE_Z = ROW_Z.land - 0.18;

export const COMMAND_Z = 0.65;
export const COMMAND_MAX_D = 0.6;

export const BACK_Z = 3;

export const PLAYER_TARGET_GAP = 0.55;

export const PILE_DEPTH = 4;

export const ZONE_LABEL_GAP = 0.2;

export const RIM_DEPTH = 0.004;

export const LAYER_STEP = RIM_DEPTH * 2;

export const TABLE_Y = 0.002;

export const CARD_THICKNESS = 0.0225;
export const ATTACHMENT_THICKNESS = CARD_THICKNESS * 0.6;

export const TABLE_CARD_RENDER_ORDER = 3;
