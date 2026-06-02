type HeroMapBackdropProps = {
  className: string;
  pictureClassName: string;
  imageClassName: string;
};

export function HeroMapBackdrop({
  className,
  pictureClassName,
  imageClassName,
}: HeroMapBackdropProps) {
  return (
    <div className={className} aria-hidden="true">
      <picture className={pictureClassName}>
        <source media="(max-width: 760px)" type="image/avif" srcSet="/hero-map-nolabels.avif" />
        <source media="(max-width: 760px)" type="image/webp" srcSet="/hero-map-nolabels.webp" />
        <source media="(max-width: 760px)" srcSet="/hero-map-nolabels.png" />
        <source type="image/avif" srcSet="/hero-map-all.avif" />
        <source type="image/webp" srcSet="/hero-map-all.webp" />
        <img
          className={imageClassName}
          src="/hero-map-all.png"
          width={2560}
          height={1536}
          alt=""
          decoding="async"
          fetchPriority="low"
          draggable={false}
        />
      </picture>
    </div>
  );
}
