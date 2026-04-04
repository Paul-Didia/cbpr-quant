import logo from "../assets/cbpr-logo.png";

type AppLogoProps = {
  size?: number;
  rounded?: string;
  shadow?: boolean;
  className?: string;
};

export function AppLogo({
  size = 80,
  rounded = "rounded-[24px]",
  shadow = true,
  className = "",
}: AppLogoProps) {
  return (
    <div
      className={`
        bg-gradient-to-br from-blue-500 to-blue-600
        flex items-center justify-center overflow-hidden
        ${rounded}
        ${shadow ? "shadow-lg shadow-blue-500/25" : ""}
        ${className}
      `}
      style={{ width: size, height: size }}
    >
      <img
        src={logo}
        alt="CBPR Quant"
        className="w-full h-full object-cover"
      />
    </div>
  );
}