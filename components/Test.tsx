import * as React from "react";

export interface TestPlasmicComponentProps {
    message?: string;
    className?: string;
}

export const TestPlasmicComponent: React.FC<TestPlasmicComponentProps> = ({
          message = "Hello from Test Component!",
          className,
      }) => {
    return (
        <div className={className}>
            <p>{message}</p>
        </div>
    );
};
