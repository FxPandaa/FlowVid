import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  useProfileStore,
  Profile,
  MAX_PROFILES,
  PROFILE_AVATARS,
} from "../stores/profileStore";
import { useFeatureGate } from "../hooks/useFeatureGate";
import { UpgradePrompt } from "../components/UpgradePrompt";
import { Pencil } from "../components/Icons";
import "./ProfileSelectPage.css";

export function ProfileSelectPage() {
  const navigate = useNavigate();
  const { canUseProfiles } = useFeatureGate();
  const {
    profiles,
    setActiveProfile,
    createProfile,
    deleteProfile,
    updateProfile,
  } = useProfileStore();

  const [showUpgrade, setShowUpgrade] = useState(false);

  // Free users who navigate here directly see the upgrade prompt
  if (!canUseProfiles) {
    return (
      <div className="profile-page">
        <div
          className="profile-page-inner"
          style={{ textAlign: "center", paddingTop: "15vh" }}
        >
          <h1 className="profile-page-title">Family Profiles</h1>
          <p className="profile-page-subtitle">
            Upgrade to FlowVid+ to create up to 8 profiles for your household.
            Everyone gets their own watchlist, continue watching, and can stream
            on different devices at the same time.
          </p>
          <button
            className="profile-create-btn"
            onClick={() => setShowUpgrade(true)}
            style={{ marginTop: 24 }}
          >
            Upgrade to FlowVid+
          </button>
          <button
            className="profile-manage-btn"
            onClick={() => navigate("/")}
            style={{ marginTop: 12 }}
          >
            Back to Home
          </button>
          {showUpgrade && (
            <UpgradePrompt
              feature="family_profiles"
              onClose={() => setShowUpgrade(false)}
            />
          )}
        </div>
      </div>
    );
  }

  const [mode, setMode] = useState<"select" | "create" | "edit" | "manage">(
    "select",
  );
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState<string>(PROFILE_AVATARS[0].color);
  const [newIcon, setNewIcon] = useState<string>(PROFILE_AVATARS[0].icon);
  const [isKid, setIsKid] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const handleSelectProfile = (profile: Profile) => {
    if (mode === "manage") {
      setEditingProfile(profile);
      setNewName(profile.name);
      setNewColor(profile.avatarColor);
      setNewIcon(profile.avatarIcon);
      setIsKid(profile.isKid);
      setMode("edit");
      return;
    }

    setActiveProfile(profile.id);
    navigate("/");
  };

  const handleCreateProfile = () => {
    if (!newName.trim()) return;

    const profile = createProfile(newName, newColor, newIcon, isKid);
    if (profile) {
      resetForm();
      setMode("select");
    }
  };

  const handleUpdateProfile = () => {
    if (!editingProfile || !newName.trim()) return;

    updateProfile(editingProfile.id, {
      name: newName,
      avatarColor: newColor,
      avatarIcon: newIcon,
      isKid,
    });

    resetForm();
    setMode("manage");
  };

  const handleDeleteProfile = (id: string) => {
    deleteProfile(id);
    setDeleteConfirmId(null);
    if (profiles.length <= 1) {
      setMode("select");
    }
  };

  const resetForm = () => {
    setNewName("");
    setNewColor(PROFILE_AVATARS[0].color);
    setNewIcon(PROFILE_AVATARS[0].icon);
    setIsKid(false);
    setEditingProfile(null);
  };

  const openCreateMode = () => {
    resetForm();
    setMode("create");
  };

  // Create / Edit form
  if (mode === "create" || mode === "edit") {
    return (
      <div className="profile-page">
        <div className="profile-page-inner">
          <h1 className="profile-page-title">
            {mode === "create" ? "Add Profile" : "Edit Profile"}
          </h1>
          <p className="profile-page-subtitle">
            {mode === "create"
              ? `Add a profile for another person watching FlowVid. You can have up to ${MAX_PROFILES}.`
              : "Update this profile's settings."}
          </p>

          <div className="profile-form">
            {/* Avatar preview */}
            <div className="profile-form-avatar-preview">
              <div
                className="profile-avatar profile-avatar-xl"
                style={{ background: newColor }}
              >
                <span>{newIcon}</span>
              </div>
            </div>

            {/* Name */}
            <div className="profile-form-field">
              <label>Name</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Profile name"
                maxLength={20}
                autoFocus
              />
            </div>

            {/* Avatar selector */}
            <div className="profile-form-field">
              <label>Avatar</label>
              <div className="avatar-grid">
                {PROFILE_AVATARS.map((avatar) => (
                  <button
                    key={`${avatar.color}-${avatar.icon}`}
                    className={`avatar-option ${
                      newColor === avatar.color && newIcon === avatar.icon
                        ? "avatar-option-selected"
                        : ""
                    }`}
                    style={{ background: avatar.color }}
                    onClick={() => {
                      setNewColor(avatar.color);
                      setNewIcon(avatar.icon);
                    }}
                  >
                    <span>{avatar.icon}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Kid toggle */}
            <div className="profile-form-field profile-form-toggle">
              <label>Kid's Profile</label>
              <button
                className={`toggle-btn ${isKid ? "toggle-btn-on" : ""}`}
                onClick={() => setIsKid(!isKid)}
                type="button"
              >
                <span className="toggle-knob" />
              </button>
              <span className="toggle-label">
                {isKid ? "Content filters enabled" : "All content"}
              </span>
            </div>

            {/* Actions */}
            <div className="profile-form-actions">
              <button
                className="btn btn-primary"
                onClick={
                  mode === "create" ? handleCreateProfile : handleUpdateProfile
                }
                disabled={!newName.trim()}
              >
                {mode === "create" ? "Create Profile" : "Save Changes"}
              </button>
              <button
                className="btn btn-ghost"
                onClick={() => {
                  resetForm();
                  setMode(mode === "edit" ? "manage" : "select");
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="profile-page">
      <div className="profile-page-inner">
        <h1 className="profile-page-title">Who's watching?</h1>

        <div className="profile-grid">
          {profiles.map((profile) => (
            <div key={profile.id} className="profile-card-wrapper">
              <button
                className={`profile-card ${mode === "manage" ? "profile-card-manage" : ""}`}
                onClick={() => handleSelectProfile(profile)}
              >
                <div
                  className="profile-avatar"
                  style={{ background: profile.avatarColor }}
                >
                  <span>{profile.avatarIcon}</span>
                  {mode === "manage" && (
                    <div className="profile-edit-badge">
                      <Pencil size={14} />
                    </div>
                  )}
                </div>
                <span className="profile-name">{profile.name}</span>
                {profile.isKid && (
                  <span className="profile-kid-badge">KID</span>
                )}
              </button>

              {mode === "manage" && deleteConfirmId === profile.id && (
                <div className="profile-delete-confirm">
                  <p>Delete "{profile.name}"?</p>
                  <div className="profile-delete-actions">
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => handleDeleteProfile(profile.id)}
                    >
                      Delete
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => setDeleteConfirmId(null)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {mode === "manage" && deleteConfirmId !== profile.id && (
                <button
                  className="profile-delete-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteConfirmId(profile.id);
                  }}
                >
                  Delete
                </button>
              )}
            </div>
          ))}

          {/* Add profile button */}
          {profiles.length < MAX_PROFILES && mode !== "manage" && (
            <button
              className="profile-card profile-card-add"
              onClick={openCreateMode}
            >
              <div className="profile-avatar profile-avatar-add">
                <span>+</span>
              </div>
              <span className="profile-name">Add Profile</span>
            </button>
          )}
        </div>

        <div className="profile-page-actions">
          {profiles.length > 0 && (
            <button
              className="btn btn-ghost"
              onClick={() => {
                setMode(mode === "manage" ? "select" : "manage");
                setDeleteConfirmId(null);
              }}
            >
              {mode === "manage" ? "Done" : "Manage Profiles"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
