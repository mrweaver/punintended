-- PunIntended Database Schema
-- Architecture: Three-tier (Global Daily Challenge → Groups → Gauntlet)

-- Express sessions (connect-pg-simple)
CREATE TABLE IF NOT EXISTS session (
    sid VARCHAR NOT NULL COLLATE "default" PRIMARY KEY,
    sess JSON NOT NULL,
    expire TIMESTAMP(6) NOT NULL
);
CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON session (expire);

-- Users (from Google OAuth)
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    google_id VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255),
    display_name VARCHAR(255),
    custom_display_name VARCHAR(255),
    photo_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Groups (Tier 2: social layer — no gameplay data, just membership)
CREATE TABLE IF NOT EXISTS groups (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Group members
CREATE TABLE IF NOT EXISTS group_members (
    group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (group_id, user_id)
);

-- Puns (Tier 1: belong to user + daily challenge, NOT to a group)
CREATE TABLE IF NOT EXISTS puns (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    challenge_id VARCHAR(10) NOT NULL,
    author_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    text TEXT NOT NULL CHECK (char_length(text) BETWEEN 1 AND 500),
    ai_score NUMERIC(3,1),
    ai_feedback TEXT,
    response_time_ms INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Challenge reveals (server-backed per-user reveal state)
CREATE TABLE IF NOT EXISTS challenge_reveals (
    challenge_id VARCHAR(10) NOT NULL,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    revealed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (challenge_id, user_id)
);

-- Pun reactions (single reaction per user per pun)
CREATE TABLE IF NOT EXISTS pun_reactions (
    pun_id UUID REFERENCES puns(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    reaction VARCHAR(20) NOT NULL CHECK (reaction IN ('groan')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (pun_id, user_id)
);

-- Chat messages (group-scoped)
CREATE TABLE IF NOT EXISTS messages (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    text TEXT NOT NULL CHECK (char_length(text) BETWEEN 1 AND 500),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Pun comments (global — no group scope)
CREATE TABLE IF NOT EXISTS pun_comments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    pun_id UUID REFERENCES puns(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    text TEXT NOT NULL CHECK (char_length(text) BETWEEN 1 AND 500),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Notifications
CREATE TABLE IF NOT EXISTS notifications (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(20) NOT NULL CHECK (type IN ('reaction', 'vote', 'system')),
    message TEXT NOT NULL,
    read BOOLEAN DEFAULT FALSE,
    link UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id);
CREATE INDEX IF NOT EXISTS idx_groups_owner ON groups(owner_id);
CREATE INDEX IF NOT EXISTS idx_puns_challenge ON puns(challenge_id);
CREATE INDEX IF NOT EXISTS idx_puns_author ON puns(author_id);
CREATE INDEX IF NOT EXISTS idx_puns_author_challenge ON puns(author_id, challenge_id);
CREATE INDEX IF NOT EXISTS idx_challenge_reveals_user ON challenge_reveals(user_id);
CREATE INDEX IF NOT EXISTS idx_pun_reactions_pun ON pun_reactions(pun_id);
CREATE INDEX IF NOT EXISTS idx_pun_reactions_user ON pun_reactions(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_group ON messages(group_id);
CREATE INDEX IF NOT EXISTS idx_pun_comments_pun ON pun_comments(pun_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_group_members_user ON group_members(user_id);

-- Auto-update timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_groups_updated_at ON groups;
CREATE TRIGGER update_groups_updated_at BEFORE UPDATE ON groups
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_puns_updated_at ON puns;
CREATE TRIGGER update_puns_updated_at BEFORE UPDATE ON puns
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_pun_reactions_updated_at ON pun_reactions;
CREATE TRIGGER update_pun_reactions_updated_at BEFORE UPDATE ON pun_reactions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
