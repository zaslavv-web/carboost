import { useEffect, useState } from "react";
import { productImageSrc, productPlaceholder } from "@/lib/productImage";

type Props = {
  imageUrl?: string | null;
  title: string;
  className?: string;
};

/**
 * Картинка товара с фолбэком: если файл удалён с сервера (404), молча
 * подставляем фирменную заглушку вместо «битой» иконки.
 */
export function ProductImage({ imageUrl, title, className }: Props) {
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [imageUrl]);

  const src = failed ? productPlaceholder(title) : productImageSrc(imageUrl, title);

  return (
    <img
      src={src}
      alt={title}
      loading="lazy"
      className={className}
      onError={() => setFailed(true)}
    />
  );
}

export default ProductImage;
