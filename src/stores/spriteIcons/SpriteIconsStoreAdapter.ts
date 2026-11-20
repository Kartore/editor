export type SpriteIcon = {
	svg: string;
	/** MapLibre の SDF アイコンとして扱う (単色。icon-color / icon-halo-* が効く)。false のときはキーごと省く */
	sdf?: true;
};

export type SpriteIcons = Record<string, SpriteIcon>;

export type SpriteIconsStoreAdapter = {
	id: string;
	load: () => Promise<SpriteIcons | null>;
	save: (icons: SpriteIcons) => Promise<void>;
};
