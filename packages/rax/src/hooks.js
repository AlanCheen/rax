import Host from './vdom/host';
import { scheduleBeforeNextRenderCallback } from './vdom/scheduler';
import { flushPassiveEffects } from './vdom/updater';

function getCurrentRenderingInstance() {
  const currentInstance = Host.component._instance;
  if (currentInstance) {
    return currentInstance;
  } else {
    throw new Error('Hooks can only be called inside a component.');
  }
}

function areInputsEqual(inputs, prevInputs) {
  for (let i = 0; i < inputs.length; i++) {
    const val1 = inputs[i];
    const val2 = prevInputs[i];
    if (
      val1 === val2 && (val1 !== 0 || 1 / val1 === 1 / val2) ||
      val1 !== val1 && val2 !== val2 // eslint-disable-line no-self-compare
    ) {
      continue;
    }
    return false;
  }
  return true;
}

export function useState(initialState) {
  const currentInstance = getCurrentRenderingInstance();
  const hookId = currentInstance.getHookId();
  const hooks = currentInstance.hooks;

  if (!hooks[hookId]) {
    // state lazy initializer
    if (typeof initialState === 'function') {
      initialState = initialState();
    }

    const setState = newState => {
      const current = hooks[hookId][0];

      if (typeof newState === 'function') {
        newState = newState(current);
      }

      if (newState !== current) {
        // This is a render phase update.  After this render pass, we'll restart
        if (Host.component && Host.component._instance === currentInstance) {
          hooks[hookId][0] = newState;
          currentInstance.isRenderScheduled = true;
        } else {
          !Host.isRendering && flushPassiveEffects();
          hooks[hookId][0] = newState;
          currentInstance.update();
        }
      }
    };

    hooks[hookId] = [
      initialState,
      setState,
    ];
  }

  return hooks[hookId];
}

export function useContext(context) {
  const currentInstance = getCurrentRenderingInstance();
  return currentInstance.readContext(context);
}

export function useEffect(effect, inputs) {
  useEffectImpl(effect, inputs, true);
}

export function useLayoutEffect(effect, inputs) {
  useEffectImpl(effect, inputs);
}

function useEffectImpl(effect, inputs, defered) {
  const currentInstance = getCurrentRenderingInstance();
  const hookId = currentInstance.getHookId();
  const hooks = currentInstance.hooks;
  inputs = inputs != null ? inputs : [effect];

  if (!hooks[hookId]) {
    const create = (immediately) => {
      if (!immediately && defered) return scheduleBeforeNextRenderCallback(() => create(true));
      const { current } = create;
      if (current) {
        // Set this to true to prevent re-entrancy
        const previousIsRendering = Host.isRendering;
        Host.isRendering = true;
        destory.current = current();
        create.current = null;
        Host.isRendering = previousIsRendering;
      }
    };

    const destory = (immediately) => {
      if (!immediately && defered) return scheduleBeforeNextRenderCallback(() => destory(true));
      const { current } = destory;
      if (current) {
        // Set this to true to prevent re-entrancy
        const previousIsRendering = Host.isRendering;
        Host.isRendering = true;
        current();
        destory.current = null;
        Host.isRendering = previousIsRendering;
      }
    };

    create.current = effect;

    currentInstance.hooks[hookId] = {
      create,
      destory,
      prevInputs: inputs,
      inputs
    };

    currentInstance.didMountHandlers.push(create);
    currentInstance.willUnmountHandlers.push(destory);
    currentInstance.didUpdateHandlers.push(() => {
      const { prevInputs, inputs, create } = hooks[hookId];
      if (prevInputs == null || !areInputsEqual(inputs, prevInputs)) {
        destory();
        create();
      }
    });
  } else {
    const hook = hooks[hookId];
    const { create, inputs: prevInputs } = hook;
    hook.inputs = inputs;
    hook.prevInputs = prevInputs;
    create.current = effect;
  }
}

export function useImperativeHandle(ref, create, inputs) {
  const nextInputs = inputs != null ? inputs.concat([ref]) : [ref, create];

  useLayoutEffect(() => {
    if (typeof ref === 'function') {
      ref(create());
      return () => ref(null);
    } else if (ref != null) {
      ref.current = create();
      return () => {
        ref.current = null;
      };
    }
  }, nextInputs);
}

export function useRef(initialValue) {
  const currentInstance = getCurrentRenderingInstance();
  const hookId = currentInstance.getHookId();
  const hooks = currentInstance.hooks;

  if (!hooks[hookId]) {
    hooks[hookId] = {
      current: initialValue
    };
  }

  return hooks[hookId];
}

export function useCallback(callback, inputs) {
  return useMemo(() => callback, inputs);
}

export function useMemo(create, inputs) {
  const currentInstance = getCurrentRenderingInstance();
  const hookId = currentInstance.getHookId();
  const hooks = currentInstance.hooks;

  if (!hooks[hookId]) {
    hooks[hookId] = [create(), inputs];
  } else {
    const hook = hooks[hookId];
    const prevInputs = hook[1];
    if (!areInputsEqual(inputs, prevInputs)) {
      hook[0] = create();
    }
  }

  return hooks[hookId][0];
}

export function useReducer(reducer, initialState, initialAction) {
  const currentInstance = getCurrentRenderingInstance();
  const hookId = currentInstance.getHookId();
  const hooks = currentInstance.hooks;

  if (!hooks[hookId]) {
    if (initialAction) {
      initialState = reducer(initialState, initialAction);
    }

    const dispatch = action => {
      const hook = hooks[hookId];
      // reducer will get in the next render, before that we add all
      // actions to the queue
      const queue = hook[2];
      // This is a render phase update.  After this render pass, we'll restart
      if (Host.component && Host.component._instance === currentInstance) {
        queue.push(action);
        currentInstance.isRenderScheduled = true;
      } else {
        !Host.isRendering && flushPassiveEffects();
        queue.push(action);
        currentInstance.update();
      }
    };

    return hooks[hookId] = [
      initialState,
      dispatch,
      []
    ];
  }
  const hook = hooks[hookId];
  const queue = hook[2];
  let next = hook[0];
  for (let i = 0; i < queue.length; i++) {
    next = reducer(next, queue[i]);
  }
  hook[0] = next;
  hook[2] = [];
  return hooks[hookId];
}
