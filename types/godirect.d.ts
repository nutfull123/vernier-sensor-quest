declare module "@vernier/godirect" {
  const godirect: {
    selectDevice(bluetooth?: boolean): Promise<unknown>;
  };

  export default godirect;
}
