import Image from "next/image";

type Props = {
  image: {
    src: string;
    alt: string;
    caption: string;
    credit: string;
    license: string;
    licenseUrl: string;
    source: string;
  };
  priority?: boolean;
};

export function BlogPhoto({ image, priority = false }: Props) {
  return (
    <figure className="blog-photo">
      <Image src={image.src} alt={image.alt} width={1200} height={900} sizes="(max-width: 820px) 100vw, 600px" priority={priority} />
      <figcaption>
        {image.caption} <a href={image.source} target="_blank" rel="noreferrer">{image.credit}</a>,{" "}
        <a href={image.licenseUrl} target="_blank" rel="noreferrer">{image.license}</a>, via Wikimedia Commons.
      </figcaption>
    </figure>
  );
}
