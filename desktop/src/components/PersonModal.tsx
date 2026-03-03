import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { tmdbService } from "../services";
import type { TmdbPersonDetails } from "../services";
import { X, StarFilled } from "./Icons";
import "./PersonModal.css";

interface PersonModalProps {
  personId: number;
  onClose: () => void;
}

export function PersonModal({ personId, onClose }: PersonModalProps) {
  const navigate = useNavigate();
  const [person, setPerson] = useState<TmdbPersonDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showFullBio, setShowFullBio] = useState(false);

  useEffect(() => {
    setIsLoading(true);
    tmdbService
      .getPersonDetails(personId)
      .then((data) => setPerson(data))
      .catch(() => setPerson(null))
      .finally(() => setIsLoading(false));
  }, [personId]);

  const handleCreditClick = async (
    credit: TmdbPersonDetails["combinedCredits"][0],
  ) => {
    // Resolve TMDB ID → IMDb ID, then navigate
    const imdbId = await tmdbService.resolveImdbId(credit.id, credit.type);
    if (imdbId) {
      onClose();
      navigate(`/details/${credit.type}/${imdbId}`);
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return null;
    try {
      return new Date(dateStr).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    } catch {
      return dateStr;
    }
  };

  const getAge = (birthday: string | null, deathday: string | null) => {
    if (!birthday) return null;
    const birth = new Date(birthday);
    const end = deathday ? new Date(deathday) : new Date();
    let age = end.getFullYear() - birth.getFullYear();
    const monthDiff = end.getMonth() - birth.getMonth();
    if (
      monthDiff < 0 ||
      (monthDiff === 0 && end.getDate() < birth.getDate())
    ) {
      age--;
    }
    return age;
  };

  return (
    <div className="person-modal-backdrop" onClick={onClose}>
      <div className="person-modal" onClick={(e) => e.stopPropagation()}>
        <button className="person-modal-close" onClick={onClose}>
          <X size={18} />
        </button>

        {isLoading && (
          <div className="person-modal-loading">
            <div className="spinner"></div>
          </div>
        )}

        {!isLoading && !person && (
          <div className="person-modal-error">
            <p>Could not load person details.</p>
          </div>
        )}

        {!isLoading && person && (
          <>
            <div className="person-modal-header">
              <div className="person-modal-photo">
                {person.profilePhotoLarge ? (
                  <img src={person.profilePhotoLarge} alt={person.name} />
                ) : (
                  <div className="person-modal-photo-placeholder">
                    {person.name
                      .split(" ")
                      .map((n) => n[0])
                      .join("")
                      .slice(0, 2)}
                  </div>
                )}
              </div>
              <div className="person-modal-info">
                <h2 className="person-modal-name">{person.name}</h2>
                <span className="person-modal-department">
                  {person.knownForDepartment}
                </span>
                <div className="person-modal-meta">
                  {person.birthday && (
                    <span className="person-meta-item">
                      Born: {formatDate(person.birthday)}
                      {!person.deathday &&
                        getAge(person.birthday, null) !== null &&
                        ` (age ${getAge(person.birthday, null)})`}
                    </span>
                  )}
                  {person.deathday && (
                    <span className="person-meta-item">
                      Died: {formatDate(person.deathday)}
                      {getAge(person.birthday, person.deathday) !== null &&
                        ` (age ${getAge(person.birthday, person.deathday)})`}
                    </span>
                  )}
                  {person.placeOfBirth && (
                    <span className="person-meta-item">
                      {person.placeOfBirth}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {person.biography && (
              <div className="person-modal-bio">
                <h3>Biography</h3>
                <p
                  className={
                    showFullBio ? "bio-full" : "bio-truncated"
                  }
                >
                  {person.biography}
                </p>
                {person.biography.length > 400 && (
                  <button
                    className="bio-toggle"
                    onClick={() => setShowFullBio(!showFullBio)}
                  >
                    {showFullBio ? "Show less" : "Read more"}
                  </button>
                )}
              </div>
            )}

            {person.combinedCredits.length > 0 && (
              <div className="person-modal-credits">
                <h3>Known For</h3>
                <div className="person-credits-grid">
                  {person.combinedCredits.map((credit, idx) => (
                    <div
                      key={`${credit.id}-${idx}`}
                      className="person-credit-card"
                      onClick={() => handleCreditClick(credit)}
                    >
                      <div className="person-credit-poster">
                        {credit.posterUrl ? (
                          <img
                            src={credit.posterUrl}
                            alt={credit.title}
                            loading="lazy"
                          />
                        ) : (
                          <div className="person-credit-poster-placeholder">
                            {credit.title.slice(0, 2)}
                          </div>
                        )}
                        {credit.rating > 0 && (
                          <span className="person-credit-rating">
                            <StarFilled size={10} /> {credit.rating}
                          </span>
                        )}
                      </div>
                      <span className="person-credit-title">
                        {credit.title}
                      </span>
                      {credit.character && (
                        <span className="person-credit-role">
                          {credit.character}
                        </span>
                      )}
                      {credit.releaseDate && (
                        <span className="person-credit-year">
                          {credit.releaseDate.split("-")[0]}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
