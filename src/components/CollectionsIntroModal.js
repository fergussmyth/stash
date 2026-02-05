import { useEffect, useRef, useState } from "react";
import { motion, useAnimation, useReducedMotion } from "framer-motion";
import ideasGraphic from "../assets/images/new-ideas-graphic.png";
import productsGraphic from "../assets/images/new-products-graphic.png";
import tripsGraphic from "../assets/images/new-trips-graphic.png";
import finalCombinedGraphic from "../assets/images/final-collection-graphic.png";

function HeroCards({ forceMotion = false }) {
  const reduceMotion = useReducedMotion();
  const shouldReduce = reduceMotion && !forceMotion;
  const cardControlOne = useAnimation();
  const cardControlTwo = useAnimation();
  const cardControlThree = useAnimation();
  const finalControls = useAnimation();
  const cardControls = [cardControlOne, cardControlTwo, cardControlThree];

  useEffect(() => {
    let cancelled = false;
    const settleTargets = [
      { x: -90, y: 24, rotate: -10, scale: 0.95, z: 10 },
      { x: 0, y: -8, rotate: 6, scale: 0.98, z: 20 },
      { x: 90, y: 28, rotate: -3, scale: 1, z: 30 },
    ];

    async function runSequence() {
      if (shouldReduce) {
        cardControls.forEach((ctrl) => ctrl.set({ opacity: 0 }));
        finalControls.set({ opacity: 1, scale: 1 });
        return;
      }

      cardControls.forEach((ctrl) =>
        ctrl.set({ opacity: 0, y: 28, scale: 0.92, rotate: 0, x: 0 })
      );
      finalControls.set({ opacity: 0, scale: 0.98 });

      await Promise.all(
        cardControls.map((ctrl, index) =>
          ctrl.start({
            opacity: 1,
            y: 0,
            scale: 1,
            transition: {
              type: "spring",
              stiffness: 220,
              damping: 22,
              bounce: 0.3,
              delay: index * 0.28,
            },
          })
        )
      );

      if (cancelled) return;
      await new Promise((resolve) => setTimeout(resolve, 1200));

      await Promise.all(
        cardControls.map((ctrl, index) => {
          const target = settleTargets[index];
          return ctrl.start({
            x: target.x,
            y: target.y,
            rotate: target.rotate,
            scale: target.scale,
            transition: { type: "spring", stiffness: 170, damping: 16, bounce: 0.35 },
          });
        })
      );

      if (cancelled) return;
      await new Promise((resolve) => setTimeout(resolve, 1400));

      cardControls.forEach((ctrl) =>
        ctrl.start({
          x: 0,
          y: 0,
          rotate: 0,
          scale: 0.92,
          opacity: 0,
          transition: { type: "spring", stiffness: 240, damping: 22 },
        })
      );
      await finalControls.start({
        opacity: 1,
        scale: 1,
        transition: { type: "spring", stiffness: 220, damping: 18, bounce: 0.35 },
      });
      if (cancelled) return;
      await finalControls.start({
        scale: [1, 1.05, 1],
        transition: { duration: 0.45, ease: "easeOut" },
      });
    }

    runSequence();
    return () => {
      cancelled = true;
    };
  }, [cardControlOne, cardControlTwo, cardControlThree, finalControls, shouldReduce]);

  const transformTemplate = (_props, generated) => `translate(-50%, -50%) ${generated}`;

  return (
    <div className="heroStack" aria-hidden="true">
      <div className="heroSpotlight" aria-hidden="true" />
      <motion.img
        className="heroCardImg"
        src={ideasGraphic}
        alt=""
        style={{ zIndex: 10 }}
        initial={{ opacity: 0, y: 28, scale: 0.92 }}
        animate={cardControls[0]}
        transformTemplate={transformTemplate}
      />
      <motion.img
        className="heroCardImg"
        src={productsGraphic}
        alt=""
        style={{ zIndex: 20 }}
        initial={{ opacity: 0, y: 28, scale: 0.92 }}
        animate={cardControls[1]}
        transformTemplate={transformTemplate}
      />
      <motion.img
        className="heroCardImg"
        src={tripsGraphic}
        alt=""
        style={{ zIndex: 30 }}
        initial={{ opacity: 0, y: 28, scale: 0.92 }}
        animate={cardControls[2]}
        transformTemplate={transformTemplate}
      />
      <motion.img
        className="heroFinalImg"
        src={finalCombinedGraphic}
        alt=""
        initial={{ opacity: 0, scale: 0.98 }}
        animate={finalControls}
        transformTemplate={transformTemplate}
      />
    </div>
  );
}

export default function CollectionsIntroModal({ open, onClose, isEmpty = false }) {
  const dialogRef = useRef(null);
  const previouslyFocusedRef = useRef(null);
  const [allowBackdropClose, setAllowBackdropClose] = useState(false);
  const [closeLocked, setCloseLocked] = useState(false);

  useEffect(() => {
    if (!open) return;
    previouslyFocusedRef.current = document.activeElement;
    const dialog = dialogRef.current;
    if (!dialog) return;
    setCloseLocked(true);
    const focusable = dialog.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const first = focusable[0];
    if (first) first.focus();

    function handleKey(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        if (!closeLocked) {
          onClose();
        }
        return;
      }

      if (event.key !== "Tab") return;
      if (focusable.length === 0) return;
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
        return;
      }
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKey);
    const closeDelay = window.setTimeout(() => {
      setAllowBackdropClose(true);
      setCloseLocked(false);
    }, 350);

    return () => {
      window.clearTimeout(closeDelay);
      setAllowBackdropClose(false);
      setCloseLocked(false);
      document.removeEventListener("keydown", handleKey);
      if (previouslyFocusedRef.current?.focus) {
        previouslyFocusedRef.current.focus();
      }
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className={`collectionsIntroOverlay ${closeLocked ? "isLocked" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="collectionsIntroTitle"
    >
      <div
        className="collectionsIntroBackdrop"
        onClick={(event) => {
          if (!allowBackdropClose || closeLocked) return;
          if (event.target === event.currentTarget) onClose();
        }}
      >
        <div className="collectionsIntroCard" ref={dialogRef}>
          <button className="collectionsIntroClose" type="button" onClick={onClose} aria-label="Close">
            ×
          </button>
          <div className="collectionsIntroHero">
            <HeroCards forceMotion />
          </div>
          <h2 className="collectionsIntroTitle" id="collectionsIntroTitle">
            {isEmpty ? "Start your first collection" : "Welcome to collections"}
          </h2>
          <p className="collectionsIntroText">
            {isEmpty
              ? "Save links to build your first collection and keep your finds organized."
              : "Save, compare, and organize your links into collections you can share."}
          </p>
          <button className="primary-btn collectionsIntroPrimary" type="button" onClick={onClose}>
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
