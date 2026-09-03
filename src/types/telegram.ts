/** Telegram Desktop JSON export types — see docs Appendix A */

export type TGExport = {
  name: string;
  type: string;
  id: number;
  messages: TGMessage[];
};

export type TGTextPart = string | { type: string; text: string; user_id?: number };

export type TGTextEntity = {
  type: string;
  text: string;
  user_id?: number;
};

export type TGMessage = {
  id: number;
  type: "message" | "service";
  date: string;
  date_unixtime: string;
  text: string | TGTextPart[];
  text_entities: TGTextEntity[];
  from?: string;
  from_id?: string;
  reply_to_message_id?: number;
  reply_to_peer_id?: string;
  edited?: string;
  edited_unixtime?: string;
  reactions?: unknown[];
  forwarded_from?: string;
  forwarded_from_id?: string;
  saved_from?: string;
  photo?: string;
  file?: string;
  media_type?: string;
  sticker_emoji?: string;
  poll?: unknown;
  actor?: string;
  actor_id?: string;
  action?: string;
  members?: string[];
  title?: string;
};

/** Normalized message used inside the app after parse worker */
export type NormalizedMessage = {
  id: number;
  date: string;
  month: string;
  from?: string;
  fromId?: string;
  text: string;
  replyToId?: number;
  isForward: boolean;
  isService: boolean;
};

export type ReplyChain = {
  /** Leaf / matched message first after root…leaf chronological order preferred */
  messages: NormalizedMessage[];
};
