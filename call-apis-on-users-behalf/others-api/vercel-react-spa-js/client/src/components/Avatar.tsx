import React, { useCallback, useState, useEffect } from "react";

interface AvatarProps {
  src?: string;
  name?: string;
  size?: number;
}

export const Avatar: React.FC<AvatarProps> = ({
  src,
  name = "User",
  size = 40,
}) => {
  const [imageError, setImageError] = useState(false);

  // Reset state when src changes (new user)
  useEffect(() => {
    if (src) {
      setImageError(false);
    }
  }, [src]);

  const handleImageError = useCallback(() => {
    setImageError(true);
  }, []);

  // Create fallback avatar URL
  const fallbackSrc = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=0d8bd0&color=fff&size=${size}`;

  if (!src || imageError) {
    return (
      <img
        src={fallbackSrc}
        alt={name}
        className="avatar"
        style={{
          width: `${size}px`,
          height: `${size}px`,
          borderRadius: "50%",
          objectFit: "cover",
        }}
      />
    );
  }

  return (
    <img
      src={src}
      alt={name}
      className="avatar"
      onError={handleImageError}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        borderRadius: "50%",
        objectFit: "cover",
      }}
    />
  );
};
