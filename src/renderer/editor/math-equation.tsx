import { MathEquation } from '../vendor/inkdrop-math/src/math';
import '../vendor/inkdrop-math/styles/katex.css';

// https://katex.org/docs/options — notes must never enable trusted HTML/URLs.
const options = {
  trust: false,
  maxExpand: 1000,
  maxSize: 20,
  strict: 'ignore',
} as const;

export default function Equation({
  code,
  inline = false,
}: {
  code: string;
  inline?: boolean;
}) {
  return <MathEquation code={code} inline={inline} options={options} />;
}
